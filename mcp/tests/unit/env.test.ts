import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env";

const valid = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "service-key",
};

describe("environment configuration", () => {
  it("rejects invalid configuration without exposing secret values", () => {
    expect(() => parseEnv({ ...valid, PORT: "70000", SUPABASE_URL: "not-a-url" })).toThrow(
      /PORT, SUPABASE_URL/
    );
    expect(() => parseEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "" })).not.toThrow(/service-key/);
  });

  it("requires positive runtime limits", () => {
    expect(() => parseEnv({ ...valid, MCP_SCRIPT_TIMEOUT_MS: "0" })).toThrow(
      /MCP_SCRIPT_TIMEOUT_MS/
    );
    expect(() => parseEnv({ ...valid, MCP_RESPONSE_FINISH_TIMEOUT_MS: "-1" })).toThrow(
      /MCP_RESPONSE_FINISH_TIMEOUT_MS/
    );
  });
});
