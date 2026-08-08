import type {
  CodeModeLogEntry,
  CodeModeResult,
  CodeModeRunOptions,
  CodeModeRuntime,
  CodeModeRuntimeOptions,
  CodeModeToolCall,
} from "../types.js";
import { CodemodeError, classifyError } from "./errors.js";
import { estimateJsonBytes, resolveLimits } from "./limits.js";
import { resolveTool } from "./tool-index.js";
import {
  generateAllInterfaces,
  generateInterfaceMap,
  generateBootstrapCode,
  generateNamespaceBridgeCode,
} from "./sandbox-bridge.js";
import { BaseCodeModeRuntime } from "./base-runtime.js";
export { BaseCodeModeRuntime } from "./base-runtime.js";
export { QuickJsCodeModeRuntime } from "./quickjs-runtime.js";
export { ExecutorCodeModeRuntime } from "./executor-runtime.js";
export type { ExecutorLike, ExecutorProvider } from "./executor-runtime.js";

export class IsolatedVmCodeModeRuntime extends BaseCodeModeRuntime {
  async run(
    code: string,
    input: unknown = {},
    runOptions: CodeModeRunOptions = {},
  ): Promise<CodeModeResult> {
    await this.ensureInitialized();

    const startedAt = Date.now();
    const limits = resolveLimits({
      ...this.options.limits,
      timeoutMs: runOptions.timeoutMs ?? this.options.limits?.timeoutMs,
    });
    const logs: CodeModeLogEntry[] = [];
    const toolCalls: CodeModeToolCall[] = [];
    const activeToolCallsRef = { value: 0 };
    const totalToolCallsRef = { value: 0 };

    const ivm = await loadIsolatedVm();
    const isolate = new ivm.Isolate({ memoryLimit: limits.memoryLimitMb });
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    // -----------------------------------------------------------------------
    // Host-side callbacks
    // -----------------------------------------------------------------------

    const hostCallTool = async (
      serverId: string,
      toolName: string,
      argsJson: string,
    ): Promise<string> => {
      return this.hostCallTool(serverId, toolName, argsJson, toolCalls, activeToolCallsRef, totalToolCallsRef, limits);
    };

    const hostSearchTools = async (query: string, limit: number): Promise<string> => {
      return this.hostSearchTools(query, limit);
    };

    const hostGetToolSchema = async (serverId: string, toolName: string): Promise<string> => {
      return this.hostGetToolSchema(serverId, toolName);
    };

    const hostCallToolRaw = async (
      serverId: string,
      toolName: string,
      argsJson: string,
    ): Promise<string> => {
      const tool = resolveTool(this.indexedTools, toolName, serverId);
      if (!tool) {
        return JSON.stringify({ success: true, result: { error: `Tool "${toolName}" was not found on server "${serverId}".`, isError: true } });
      }

      const server = this.servers.get(tool.serverId);
      if (!server) {
        return JSON.stringify({ success: true, result: { error: `Server "${tool.serverId}" is no longer registered.`, isError: true } });
      }

      try {
        const result = server.callToolRaw
          ? await server.callToolRaw(toolName, JSON.parse(argsJson))
          : await server.callTool(toolName, JSON.parse(argsJson));
        return JSON.stringify({ success: true, result });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return JSON.stringify({ success: true, result: { error: errorMsg, isError: true } });
      }
    };

    const hostLog = (level: CodeModeLogEntry["level"], args: unknown[]) => {
      this.hostLog(level, args, logs, limits);
    };

    try {
      const context = await isolate.createContext();
      const jail = context.global;
      await jail.set("globalThis", jail.derefInto());

      // Input
      await jail.set("__input", new ivm.ExternalCopy(input).copyInto());

      // Log handlers
      const createLogHandler = (prefix: string) => {
        return new ivm.Reference((...args: unknown[]) => {
          const message = (args as string[]).join(" ");
          hostLog(
            (prefix === "" ? "log" : prefix === "[ERROR]" ? "error" : prefix === "[WARN]" ? "warn" : "info") as CodeModeLogEntry["level"],
            [message],
          );
        });
      };
      await jail.set("__logRef", createLogHandler(""));
      await jail.set("__errorRef", createLogHandler("[ERROR]"));
      await jail.set("__warnRef", createLogHandler("[WARN]"));
      await jail.set("__infoRef", createLogHandler("[INFO]"));

      // Tool call reference (async, returns JSON string)
      const toolCallerRef = new ivm.Reference(hostCallTool);
      await jail.set("__callToolRef", toolCallerRef);

      // Search tools reference
      const searchRef = new ivm.Reference(hostSearchTools);
      await jail.set("__searchToolsRef", searchRef);

      // Raw tool call reference
      const rawToolCallerRef = new ivm.Reference(hostCallToolRaw);
      await jail.set("__callToolRawRef", rawToolCallerRef);

      // Get tool schema reference
      const schemaRef = new ivm.Reference(hostGetToolSchema);
      await jail.set("__getToolSchemaRef", schemaRef);

      // Generate interfaces
      const interfacesString = generateAllInterfaces(this.indexedTools);
      const interfaceMap = generateInterfaceMap(this.indexedTools);
      const interfaceMapJson = JSON.stringify(interfaceMap);

      // Bootstrap: console, callTool, searchTools, interfaces
      const bootstrapCode = generateBootstrapCode(interfacesString, interfaceMapJson);
      const bootstrapScript = await isolate.compileScript(bootstrapCode);
      await bootstrapScript.run(context);

      // Namespace bridging: server.tool(args) functions
      const namespaceBridgeCode = generateNamespaceBridgeCode(this.indexedTools, this.servers);
      if (namespaceBridgeCode.trim()) {
        const namespaceScript = await isolate.compileScript(namespaceBridgeCode);
        await namespaceScript.run(context);
      }

      // User code execution using UTCP's async IIFE + callback pattern
      let resolveResult!: (json: string) => void;
      let rejectResult!: (err: Error) => void;
      const resultPromise = new Promise<string>((res, rej) => {
        resolveResult = res;
        rejectResult = rej;
      });

      await jail.set(
        "__resolveResult",
        new ivm.Reference((jsonStr: string) => resolveResult(jsonStr)),
      );
      await jail.set(
        "__rejectResult",
        new ivm.Reference((errStr: string) => rejectResult(new Error(errStr))),
      );

      const wrappedCode = `
        (async function() {
          try {
            const __result = await (async function() {
              ${code}
            })();
            __resolveResult.applySync(undefined, [JSON.stringify({ __result: __result === undefined ? null : __result })]);
          } catch (e) {
            __rejectResult.applySync(undefined, [String(e && e.stack ? e.stack : e)]);
          }
        })()
      `;

      // Set up timeout race
      const timeoutPromise = new Promise<string>((_, rej) => {
        timeoutHandle = setTimeout(
          () => rej(CodemodeError.timeout(`Script execution timeout after ${limits.timeoutMs}ms`)),
          limits.timeoutMs,
        );
      });
      const settledPromise = Promise.race([resultPromise, timeoutPromise]);
      resultPromise.catch(() => {});
      timeoutPromise.catch(() => {});

      const script = await isolate.compileScript(wrappedCode);
      script.run(context, { timeout: limits.timeoutMs }).catch(() => {});

      const resultJson = await settledPromise;
      const value = JSON.parse(resultJson).__result;

      if (estimateJsonBytes(value) > limits.maxResultBytes) {
        throw CodemodeError.resultTooLarge(`Result too large: maxResultBytes ${limits.maxResultBytes} exceeded.`);
      }

      return {
        value,
        logs,
        toolCalls,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        logs,
        toolCalls,
        durationMs: Date.now() - startedAt,
        error: classifyError(error),
      };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      isolate.dispose();
    }
  }
}

export async function createCodeModeRuntime(
  options: CodeModeRuntimeOptions & {
    runtime?: "isolated-vm" | "quickjs" | "executor";
    executor?: import("./executor-runtime.js").ExecutorLike;
  },
): Promise<CodeModeRuntime> {
  if (options.runtime === "executor") {
    if (!options.executor) {
      throw new Error('createCodeModeRuntime({ runtime: "executor" }) requires an executor.');
    }
    const { ExecutorCodeModeRuntime } = await import("./executor-runtime.js");
    const runtime = new ExecutorCodeModeRuntime({
      ...options,
      executor: options.executor,
    });
    await runtime.searchTools("", 1);
    return runtime;
  }

  const runtimeType = options.runtime ?? await tryDetectRuntime();
  if (runtimeType === 'quickjs') {
    const { QuickJsCodeModeRuntime } = await import("./quickjs-runtime.js");
    const runtime = new QuickJsCodeModeRuntime(options);
    await runtime.searchTools("", 1);
    return runtime;
  }
  const runtime = new IsolatedVmCodeModeRuntime(options);
  await runtime.searchTools("", 1);
  return runtime;
}

export async function tryDetectRuntime(): Promise<'isolated-vm' | 'quickjs'> {
  try {
    await import("isolated-vm");
    return 'isolated-vm';
  } catch {
    return 'quickjs';
  }
}

async function loadIsolatedVm(): Promise<typeof import("isolated-vm").default> {
  try {
    const loaded = await import("isolated-vm");
    return loaded.default;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `isolated-vm is required to run codemode sandboxes but could not be loaded: ${message}`,
    );
  }
}
