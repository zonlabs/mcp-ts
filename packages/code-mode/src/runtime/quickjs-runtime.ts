import type {
  CodeModeLogEntry,
  CodeModeResult,
  CodeModeRunOptions,
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

type QuickJsAsyncContext = Awaited<ReturnType<Awaited<ReturnType<typeof loadQuickJs>>["newContext"]>>;

export class QuickJsCodeModeRuntime extends BaseCodeModeRuntime {
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

    let contextToDispose: QuickJsAsyncContext | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      const ctx = await createQuickJsContext();
      contextToDispose = ctx;
      ctx.runtime.setMemoryLimit(limits.memoryLimitMb * 1024 * 1024);
      const deadline = Date.now() + limits.timeoutMs;
      ctx.runtime.setInterruptHandler(() => Date.now() >= deadline);

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

      // Register asyncified host functions
      const logRef = ctx.newAsyncifiedFunction("__logRef", async (...hostArgs) => {
        const msgs = hostArgs.map((a) => ctx.getString(a));
        hostLog("log", msgs);
      });
      ctx.setProp(ctx.global, "__logRef", logRef);

      const errorRef = ctx.newAsyncifiedFunction("__errorRef", async (...hostArgs) => {
        const msgs = hostArgs.map((a) => ctx.getString(a));
        hostLog("error", msgs);
      });
      ctx.setProp(ctx.global, "__errorRef", errorRef);

      const warnRef = ctx.newAsyncifiedFunction("__warnRef", async (...hostArgs) => {
        const msgs = hostArgs.map((a) => ctx.getString(a));
        hostLog("warn", msgs);
      });
      ctx.setProp(ctx.global, "__warnRef", warnRef);

      const infoRef = ctx.newAsyncifiedFunction("__infoRef", async (...hostArgs) => {
        const msgs = hostArgs.map((a) => ctx.getString(a));
        hostLog("info", msgs);
      });
      ctx.setProp(ctx.global, "__infoRef", infoRef);

      const callToolRef = ctx.newAsyncifiedFunction("__callToolRef", async (serverId, toolName, argsJson) => {
        const s = ctx.getString(serverId);
        const t = ctx.getString(toolName);
        const a = ctx.getString(argsJson);
        const result = await hostCallTool(s, t, a);
        return ctx.newString(result);
      });
      ctx.setProp(ctx.global, "__callToolRef", callToolRef);

      const callToolRawRef = ctx.newAsyncifiedFunction("__callToolRawRef", async (serverId, toolName, argsJson) => {
        const s = ctx.getString(serverId);
        const t = ctx.getString(toolName);
        const a = ctx.getString(argsJson);
        const result = await hostCallToolRaw(s, t, a);
        return ctx.newString(result);
      });
      ctx.setProp(ctx.global, "__callToolRawRef", callToolRawRef);

      const searchToolsRef = ctx.newAsyncifiedFunction("__searchToolsRef", async (query, limit) => {
        const q = ctx.getString(query);
        const l = ctx.getNumber(limit);
        const result = await hostSearchTools(q, l);
        return ctx.newString(result);
      });
      ctx.setProp(ctx.global, "__searchToolsRef", searchToolsRef);

      const getToolSchemaRef = ctx.newAsyncifiedFunction("__getToolSchemaRef", async (serverId, toolName) => {
        const s = ctx.getString(serverId);
        const t = ctx.getString(toolName);
        const result = await hostGetToolSchema(s, t);
        return ctx.newString(result);
      });
      ctx.setProp(ctx.global, "__getToolSchemaRef", getToolSchemaRef);

      // Input — serialize to JSON string, parse inside QuickJS
      const inputHandle = ctx.newString(JSON.stringify(input));
      ctx.setProp(ctx.global, "__input", inputHandle);

      // Generate interfaces
      const interfacesString = generateAllInterfaces(this.indexedTools);
      const interfaceMap = generateInterfaceMap(this.indexedTools);
      const interfaceMapJson = JSON.stringify(interfaceMap);

      // Bootstrap: console, callTool, searchTools, interfaces
      const bootstrapCode = generateBootstrapCode(interfacesString, interfaceMapJson, true);
      const bootstrapResult = await ctx.evalCodeAsync(bootstrapCode);
      if (bootstrapResult.error) {
        const errMsg = ctx.dump(bootstrapResult.error);
        throw new Error(`Bootstrap failed: ${errMsg?.message ?? String(errMsg)}`);
      }

      // Namespace bridging: server.tool(args) functions
      const namespaceBridgeCode = generateNamespaceBridgeCode(this.indexedTools, this.servers, true);
      if (namespaceBridgeCode.trim()) {
        const nsResult = await ctx.evalCodeAsync(namespaceBridgeCode);
        if (nsResult.error) {
          const errMsg = ctx.dump(nsResult.error);
          throw new Error(`Namespace bridge failed: ${errMsg?.message ?? String(errMsg)}`);
        }
      }

      // Host-side timeout safety net
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(CodemodeError.timeout(`QuickJS execution timeout after ${limits.timeoutMs}ms`)),
          limits.timeoutMs,
        );
      });
      timeoutPromise.catch(() => {});

      // User code execution — wrap in IIFE only if code starts with `return` (Issue 2)
      let codeToExecute = code;
      if (code.trimStart().startsWith("return")) {
        const codeBody = code.replace(/^\s*return\b\s*/, "");
        codeToExecute = `(function() { return ${codeBody} })()`;
      }
      const userResult = await Promise.race([ctx.evalCodeAsync(codeToExecute), timeoutPromise]);
      if (userResult.error) {
        const errHandle = userResult.error;
        const errMsg = ctx.dump(errHandle);
        const message = errMsg?.message ?? String(errMsg);
        const stack = errMsg?.stack;
        const errorDetail = stack ? `${message}\n${stack}` : message;
        throw new Error(errorDetail);
      }

      const raw = ctx.dump(userResult.value);

      if (estimateJsonBytes(raw) > limits.maxResultBytes) {
        throw CodemodeError.resultTooLarge(`Result too large: maxResultBytes ${limits.maxResultBytes} exceeded.`);
      }

      return {
        value: raw,
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
      contextToDispose?.dispose();
    }
  }
}

async function loadQuickJs() {
  try {
    const { newQuickJSAsyncWASMModuleFromVariant } = await import("quickjs-emscripten-core");
    return newQuickJSAsyncWASMModuleFromVariant(
      import("@jitl/quickjs-singlefile-browser-release-asyncify"),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `QuickJS singlefile asyncify runtime is required to run codemode sandboxes but could not be loaded: ${message}`,
    );
  }
}

async function createQuickJsContext(): Promise<QuickJsAsyncContext> {
  const quickJs = await loadQuickJs();
  return quickJs.newContext();
}
