import type { CodeModeError } from "../types.js";
import { CodeModeErrorCode } from "../types.js";

export class CodemodeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CodemodeError";
    this.code = code;
    Object.setPrototypeOf(this, CodemodeError.prototype);
  }

  static timeout(message: string) {
    return new CodemodeError(CodeModeErrorCode.TIMEOUT, message);
  }

  static resultTooLarge(message: string) {
    return new CodemodeError(CodeModeErrorCode.RESULT_TOO_LARGE, message);
  }

  static sandbox(message: string) {
    return new CodemodeError(CodeModeErrorCode.SANDBOX_ERROR, message);
  }
}

export function classifyError(error: unknown): CodeModeError {
  if (error instanceof CodemodeError) {
    return { code: error.code as CodeModeError["code"], message: error.message };
  }

  if (error instanceof Error && "code" in error) {
    const code = (error as Record<string, unknown>).code;
    if (typeof code === "string" && code in CodeModeErrorCode) {
      return { code: code as CodeModeError["code"], message: error.message };
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("timeout")) return { code: "TIMEOUT", message };
  if (lower.includes("interrupted")) return { code: "TIMEOUT", message };
  return { code: "SANDBOX_ERROR", message };
}
