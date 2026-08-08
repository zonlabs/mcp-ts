import type {
  CodeModeLimits,
  CodeModeLogEntry,
  CodeModeResult,
  CodeModeRunOptions,
  CodeModeRuntimeOptions,
  CodeModeToolCall,
} from "../types.js";
import { classifyError } from "./errors.js";
import { resolveLimits } from "./limits.js";
import { resolveTool } from "./tool-index.js";
import { BaseCodeModeRuntime } from "./base-runtime.js";

export interface ExecutorProvider {
  name: string;
  fns: Record<string, (args: unknown) => Promise<unknown>>;
  prelude?: string;
}

export interface ExecutorLike {
  execute(
    code: string,
    providers: ExecutorProvider[],
    options?: { timeoutMs?: number },
  ): Promise<{ result?: unknown; error?: string; logs?: string[] }>;
}

export interface ExecutorCodeModeRuntimeOptions extends CodeModeRuntimeOptions {
  executor: ExecutorLike;
}

export class ExecutorCodeModeRuntime extends BaseCodeModeRuntime {
  readonly #executor: ExecutorLike;

  constructor(options: ExecutorCodeModeRuntimeOptions) {
    super(options);
    this.#executor = options.executor;
  }

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

    try {
      const outcome = await this.#executor.execute(
        this.wrapCode(code, input),
        this.buildProviders(toolCalls, activeToolCallsRef, totalToolCallsRef, limits),
        { timeoutMs: limits.timeoutMs },
      );

      for (const message of outcome.logs ?? []) {
        this.hostLog("log", [message], logs, limits);
      }

      if (outcome.error) {
        throw new Error(outcome.error);
      }

      return {
        value: outcome.result,
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
    }
  }

  private buildProviders(
    toolCalls: CodeModeToolCall[],
    activeToolCallsRef: { value: number },
    totalToolCallsRef: { value: number },
    limits: Required<CodeModeLimits>,
  ): ExecutorProvider[] {
    const providers = new Map<string, ExecutorProvider>();

    for (const tool of this.indexedTools) {
      const provider = providers.get(tool.serverId) ?? {
        name: tool.serverId,
        fns: {},
      };

      provider.fns[tool.toolName] = async (args: unknown) => {
        const payload = await this.hostCallTool(
          tool.serverId,
          tool.toolName,
          JSON.stringify(args ?? {}),
          toolCalls,
          activeToolCallsRef,
          totalToolCallsRef,
          limits,
        );
        return JSON.parse(payload).result;
      };

      providers.set(tool.serverId, provider);
    }

    providers.set("codemode", {
      name: "codemode",
      fns: {
        searchTools: async (args: unknown) => {
          const inputArgs = asRecord(args);
          return JSON.parse(
            this.hostSearchTools(
              stringValue(inputArgs.query),
              numberValue(inputArgs.limit, this.maxSearchResults),
            ),
          );
        },
        getToolSchema: async (args: unknown) => {
          const inputArgs = asRecord(args);
          return JSON.parse(
            this.hostGetToolSchema(
              stringValue(inputArgs.serverId),
              stringValue(inputArgs.toolName),
            ),
          );
        },
        callTool: async (args: unknown) => {
          const inputArgs = asRecord(args);
          const payload = await this.hostCallTool(
            stringValue(inputArgs.serverId),
            stringValue(inputArgs.toolName),
            JSON.stringify(asRecord(inputArgs.args)),
            toolCalls,
            activeToolCallsRef,
            totalToolCallsRef,
            limits,
          );
          return JSON.parse(payload).result;
        },
        callToolRaw: async (args: unknown) => {
          const inputArgs = asRecord(args);
          const serverId = stringValue(inputArgs.serverId);
          const toolName = stringValue(inputArgs.toolName);
          const tool = resolveTool(this.indexedTools, toolName, serverId);
          if (!tool) {
            return { error: `Tool "${toolName}" was not found on server "${serverId}".`, isError: true };
          }

          const server = this.servers.get(tool.serverId);
          if (!server) {
            return { error: `Server "${tool.serverId}" is no longer registered.`, isError: true };
          }

          return server.callToolRaw
            ? server.callToolRaw(tool.toolName, asRecord(inputArgs.args))
            : server.callTool(tool.toolName, asRecord(inputArgs.args));
        },
      },
    });

    return [...providers.values()];
  }

  private wrapCode(code: string, input: unknown): string {
    const body = code.trimStart().startsWith("return")
      ? code
      : `return await (async () => { ${code} })();`;

    return `
      const input = ${JSON.stringify(input)};
      const callTool = (serverId, toolName, args) => codemode.callTool({ serverId, toolName, args });
      const callToolRaw = (serverId, toolName, args) => codemode.callToolRaw({ serverId, toolName, args });
      const searchTools = (query, limit) => codemode.searchTools({ query, limit });
      const getToolSchema = (serverId, toolName) => codemode.getToolSchema({ serverId, toolName });
      (async () => {
        ${body}
      })()
    `;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
