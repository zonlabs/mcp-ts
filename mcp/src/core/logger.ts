import { getRequestContext } from "./request-context";

function redact(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);

  const redacted: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("secret") ||
      lowerKey.includes("token") ||
      lowerKey.includes("password") ||
      lowerKey.includes("code") ||
      lowerKey.includes("key") ||
      lowerKey.includes("verifier") ||
      lowerKey.includes("challenge") ||
      lowerKey.includes("authorization")
    ) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redact(val);
    }
  }
  return redacted;
}

export class StructuredLogger {
  private getMetadata() {
    let context: any = {};
    try {
      context = getRequestContext();
    } catch {
      // request context may not be initialized outside HTTP request handlers
    }
    return {
      requestId: context?.requestId,
      userId: context?.userId,
      mcpSessionId: context?.mcpSessionId,
      railwayReplica: process.env.RAILWAY_REPLICA_ID || process.env.RAILWAY_STATIC_URL || undefined,
    };
  }

  log(level: "debug" | "info" | "warn" | "error", event: string, extra?: Record<string, any>) {
    const logObj = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...this.getMetadata(),
      ...redact(extra),
    };
    console.log(JSON.stringify(logObj));
  }

  debug(event: string, extra?: Record<string, any>) {
    this.log("debug", event, extra);
  }
  info(event: string, extra?: Record<string, any>) {
    this.log("info", event, extra);
  }
  warn(event: string, extra?: Record<string, any>) {
    this.log("warn", event, extra);
  }
  error(event: string, extra?: Record<string, any>) {
    this.log("error", event, extra);
  }
}

export const logger = new StructuredLogger();
