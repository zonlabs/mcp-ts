import type {
  QuickJSContext,
  QuickJSHandle,
  QuickJSWASMModule,
} from "quickjs-emscripten";
import { getQuickJS } from "quickjs-emscripten";
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

interface ExecState {
  deadline: number;
  pendingCancels: Set<() => void>;
}

/** Grace window for cancellation continuations after a timeout. */
const CANCEL_GRACE_MS = 100;

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

    let vm: QuickJSContext | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let guestSettled = true;
    const execState: ExecState = { deadline: 0, pendingCancels: new Set<() => void>() };

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

    // A timed-out run cancels every outstanding tool call so the guest program
    // can settle and the VM can be disposed. Disposing a runtime that still
    // holds an unsettled program promise aborts the shared WASM module.
    const releaseVm = async () => {
      if (!vm) return;
      if (execState.pendingCancels.size > 0) {
        execState.deadline = Date.now() + CANCEL_GRACE_MS;
        for (const cancel of [...execState.pendingCancels]) cancel();
        execState.pendingCancels.clear();
        await new Promise((r) => setTimeout(r, 0));
        execState.deadline = 0;
      }
      if (guestSettled) {
        vm.dispose();
      }
      vm = undefined;
    };

    try {
      const QuickJS = await loadQuickJs();
      vm = QuickJS.newContext();
      const v = vm;

      v.runtime.setMemoryLimit(limits.memoryLimitMb * 1024 * 1024);
      v.runtime.setMaxStackSize(512 * 1024);
      v.runtime.setInterruptHandler(() => Date.now() > execState.deadline);

      // Promise bridge instead of newAsyncifiedFunction: repeated asyncify
      // suspensions corrupt QuickJS refcounts and abort the WASM module
      // (https://github.com/justjake/quickjs-emscripten/issues/258). The
      // bridge never suspends the WASM stack, so that bug cannot trigger.
      const bridgeHostFunction = (
        name: string,
        read: (...handles: QuickJSHandle[]) => unknown[],
        impl: (args: unknown[]) => string | Promise<string>,
      ): void => {
        const fn = v.newFunction(name, (...argHandles) => {
          const promise = v.newPromise();
          const resolveWithPayload = (payloadJson: string) => {
            execState.pendingCancels.delete(cancel);
            if (!v.alive || !promise.alive) return;
            const payloadHandle = v.newString(payloadJson);
            promise.resolve(payloadHandle);
            payloadHandle.dispose();
          };
          const cancel = () =>
            resolveWithPayload(
              JSON.stringify({ success: false, error: "Execution timed out" }),
            );
          execState.pendingCancels.add(cancel);

          let args: unknown[] = [];
          let readFailed = false;
          try {
            args = read(...argHandles);
          } catch (readError) {
            readFailed = true;
            const readMsg = readError instanceof Error ? readError.message : String(readError);
            resolveWithPayload(JSON.stringify({ success: false, error: readMsg }));
          }
          if (!readFailed) {
            void Promise.resolve()
              .then(() => impl(args))
              .then(resolveWithPayload, (error) => {
                const errorMsg = error instanceof Error ? error.message : String(error);
                resolveWithPayload(JSON.stringify({ success: false, error: errorMsg }));
              });
          }

          void promise.settled.then(() => {
            try {
              if (v.alive && v.runtime.alive) {
                const jobs = v.runtime.executePendingJobs();
                if (jobs.error) {
                  const dumped = JSON.stringify(v.dump(jobs.error));
                  this.hostLog("error", [`uncaught error in sandboxed code: ${dumped}`], logs, limits);
                  jobs.error.dispose();
                }
              }
            } finally {
              promise.dispose();
            }
          });

          return promise.handle;
        });
        v.setProp(v.global, name, fn);
        fn.dispose();
      };

      bridgeHostFunction("__logRef", (...handles) => handles.map((h) => v.getString(h)), (msgs) => {
        this.hostLog("log", msgs, logs, limits);
        return "";
      });
      bridgeHostFunction("__errorRef", (...handles) => handles.map((h) => v.getString(h)), (msgs) => {
        this.hostLog("error", msgs, logs, limits);
        return "";
      });
      bridgeHostFunction("__warnRef", (...handles) => handles.map((h) => v.getString(h)), (msgs) => {
        this.hostLog("warn", msgs, logs, limits);
        return "";
      });
      bridgeHostFunction("__infoRef", (...handles) => handles.map((h) => v.getString(h)), (msgs) => {
        this.hostLog("info", msgs, logs, limits);
        return "";
      });

      bridgeHostFunction(
        "__callToolRef",
        (serverId, toolName, argsJson) => [
          v.getString(serverId),
          v.getString(toolName),
          v.getString(argsJson),
        ],
        ([serverId, toolName, argsJson]) =>
          this.hostCallTool(
            serverId as string,
            toolName as string,
            argsJson as string,
            toolCalls,
            activeToolCallsRef,
            totalToolCallsRef,
            limits,
          ),
      );

      bridgeHostFunction(
        "__callToolRawRef",
        (serverId, toolName, argsJson) => [
          v.getString(serverId),
          v.getString(toolName),
          v.getString(argsJson),
        ],
        ([serverId, toolName, argsJson]) =>
          hostCallToolRaw(serverId as string, toolName as string, argsJson as string),
      );

      bridgeHostFunction(
        "__searchToolsRef",
        (query, limit) => [
          v.getString(query),
          limit && v.typeof(limit) !== "undefined" ? v.getNumber(limit) : 10,
        ],
        ([query, limit]) => this.hostSearchTools(query as string, limit as number),
      );

      bridgeHostFunction(
        "__getToolSchemaRef",
        (serverId, toolName) => [v.getString(serverId), v.getString(toolName)],
        ([serverId, toolName]) => this.hostGetToolSchema(serverId as string, toolName as string),
      );

      const inputHandle = v.newString(JSON.stringify(input));
      v.setProp(v.global, "__input", inputHandle);
      inputHandle.dispose();

      const interfacesString = generateAllInterfaces(this.indexedTools);
      const interfaceMapJson = JSON.stringify(generateInterfaceMap(this.indexedTools));

      execState.deadline = Date.now() + limits.timeoutMs;

      const bootstrapCode = generateBootstrapCode(interfacesString, interfaceMapJson, true);
      const bootstrapResult = v.evalCode(bootstrapCode);
      if (bootstrapResult.error) {
        const errMsg = v.dump(bootstrapResult.error);
        bootstrapResult.error.dispose();
        throw new Error(`Bootstrap failed: ${errMsg?.message ?? String(errMsg)}`);
      }
      bootstrapResult.value?.dispose();

      const namespaceBridgeCode = generateNamespaceBridgeCode(this.indexedTools, this.servers, true);
      if (namespaceBridgeCode.trim()) {
        const nsResult = v.evalCode(namespaceBridgeCode);
        if (nsResult.error) {
          const errMsg = v.dump(nsResult.error);
          nsResult.error.dispose();
          throw new Error(`Namespace bridge failed: ${errMsg?.message ?? String(errMsg)}`);
        }
        nsResult.value?.dispose();
      }

      const wrappedCode = `(async function() {
  try {
    const __userResult = await (async function() { ${code} })();
    return JSON.stringify({ __result: __userResult === undefined ? null : __userResult });
  } catch (__error) { throw __error; }
})()`;

      execState.deadline = Date.now() + limits.timeoutMs;

      const evalResult = v.evalCode(wrappedCode);
      if (evalResult.error) {
        const errMsg = v.dump(evalResult.error);
        evalResult.error.dispose();
        throw new Error(errMsg?.message ?? String(errMsg));
      }

      const promiseHandle = v.unwrapResult(evalResult);
      const nativePromise = v.resolvePromise(promiseHandle);
      promiseHandle.dispose();

      guestSettled = false;
      void nativePromise.then(
        () => { guestSettled = true; },
        () => { guestSettled = true; },
      );

      const jobs = v.runtime.executePendingJobs();
      if (jobs.error) {
        const errMsg = v.dump(jobs.error);
        jobs.error.dispose();
        throw new Error(errMsg?.message ?? String(errMsg));
      }

      const deadline = Date.now() + limits.timeoutMs;
      const settled = await new Promise<Awaited<ReturnType<typeof v.resolvePromise>>>((resolve, reject) => {
        let timedOut = false;
        timeoutHandle = setTimeout(
          () => {
            timedOut = true;
            reject(CodemodeError.timeout(`QuickJS execution timeout after ${limits.timeoutMs}ms`));
          },
          Math.max(0, deadline - Date.now()),
        );
        nativePromise.then(
          (result) => {
            if (timedOut) {
              try {
                if (result.error) result.error.dispose();
                else result.value.dispose();
              } catch {}
              return;
            }
            clearTimeout(timeoutHandle);
            resolve(result);
          },
          (error) => {
            if (timedOut) return;
            clearTimeout(timeoutHandle);
            reject(error);
          },
        );
      });

      const valueHandle = v.unwrapResult(settled);
      const raw = v.dump(valueHandle);
      valueHandle.dispose();

      const parsed = JSON.parse(raw) as { __result?: unknown };
      const value = parsed.__result;

      if (estimateJsonBytes(value) > limits.maxResultBytes) {
        throw CodemodeError.resultTooLarge(`Result too large: maxResultBytes ${limits.maxResultBytes} exceeded.`);
      }

      await releaseVm();
      return {
        value,
        logs,
        toolCalls,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      await releaseVm();
      return {
        logs,
        toolCalls,
        durationMs: Date.now() - startedAt,
        error: classifyError(error),
      };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}

async function loadQuickJs(): Promise<QuickJSWASMModule> {
  try {
    return await getQuickJS();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `quickjs-emscripten is required to run codemode sandboxes but could not be loaded: ${message}`,
    );
  }
}
