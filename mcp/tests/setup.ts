import { beforeAll, afterAll, vi } from "vitest";

// Provide the minimum env vars that modules need at import time
beforeAll(() => {
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.OPENAI_API_KEY = "sk-test-openai";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.GOOGLE_AI_API_KEY = "test-google-key";
  process.env.DEEPSEEK_API_KEY = "sk-test-deepseek";
  process.env.AI_DEFAULT_PROVIDER = "openai";
  process.env.AI_DEFAULT_MODEL = "gpt-4o";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.MCP_OAUTH_CODE_SECRET = "test-mcp-oauth-code-secret-value-123";
  process.env.MCP_OAUTH_ACCESS_TOKEN_SECRET = "test-mcp-oauth-access-secret-value-123";
});

afterAll(() => {
  vi.restoreAllMocks();
});
