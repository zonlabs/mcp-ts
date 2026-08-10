import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  REDIS_URL: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  MCP_RESOURCE_URL: z.string().optional(),
  MCP_RESOURCE_DOC_URL: z.string().optional(),
  MCP_SCRIPT_TIMEOUT_MS: z.coerce.number().int().positive().default(240000),
  MCP_SESSION_REFRESH_MS: z.coerce.number().int().positive().optional(),
  MCP_CLIENT_IDLE_TTL_MS: z.coerce.number().int().positive().optional(),
  MCP_RESPONSE_FINISH_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

export type Env = z.infer<typeof envSchema>;

let _config: Env | null = null;

export function parseEnv(input: unknown): Env {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const fieldSet = new Set(result.error.issues.map((i) => i.path.join(".")));
    const fields = Array.from(fieldSet).sort((a, b) => {
      if (a === "PORT") return -1;
      if (b === "PORT") return 1;
      return a.localeCompare(b);
    });
    throw new Error(`Invalid environment configuration fields: ${fields.join(", ")}`);
  }
  return result.data;
}

export function loadEnv(): Env {
  if (_config) return _config;
  try {
    _config = parseEnv(process.env);
    return _config;
  } catch (error: any) {
    console.error(`[env] Failed to load environment: ${error.message}`);
    throw error;
  }
}

export function getIssuer(): string {
  const env = loadEnv();
  return `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;
}
