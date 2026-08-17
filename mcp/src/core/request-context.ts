import { AsyncLocalStorage } from "node:async_hooks";

export type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export type RequestContext = {
  userId?: string;
  requestId?: string;
  mcpSessionId?: string;
  scopes?: string[];
  env?: Record<string, unknown>;
  executionCtx?: WorkerExecutionContext;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext {
  return storage.getStore() ?? {};
}
