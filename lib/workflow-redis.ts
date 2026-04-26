import IORedis, { RedisOptions } from "ioredis";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function resolveWorkflowRedisUrl(): string {
  if (isNonEmptyString(process.env.REDIS_URL)) {
    return process.env.REDIS_URL.trim();
  }

  const railwayHost = process.env.REDISHOST?.trim();
  const railwayPort = process.env.REDISPORT?.trim();
  const railwayPassword = process.env.REDISPASSWORD?.trim();
  const railwayUser = process.env.REDISUSER?.trim() || "default";

  if (railwayHost && railwayPort) {
    const protocol = parseBoolean(process.env.REDIS_TLS) ? "rediss" : "redis";
    if (railwayPassword) {
      return `${protocol}://${encodeURIComponent(railwayUser)}:${encodeURIComponent(
        railwayPassword
      )}@${railwayHost}:${railwayPort}/0`;
    }
    return `${protocol}://${railwayHost}:${railwayPort}/0`;
  }

  const host = process.env.REDIS_HOST?.trim() || "localhost";
  const port = process.env.REDIS_PORT?.trim() || "6379";
  const password = process.env.REDIS_PASSWORD?.trim();
  const protocol = parseBoolean(process.env.REDIS_TLS) ? "rediss" : "redis";

  if (password) {
    return `${protocol}://default:${encodeURIComponent(password)}@${host}:${port}/0`;
  }
  return `${protocol}://${host}:${port}/0`;
}

export function createWorkflowRedisConnection(): IORedis {
  const redisUrl = resolveWorkflowRedisUrl();
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
  };

  if (redisUrl.startsWith("rediss://")) {
    options.tls = {};
  }

  return new IORedis(redisUrl, options);
}
