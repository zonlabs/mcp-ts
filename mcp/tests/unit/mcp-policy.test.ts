import { beforeEach, describe, expect, it } from "vitest";
import { policyManager } from "../../src/core/policy";

describe("McpPolicyManager", () => {
  beforeEach(() => {
    // Reset internal state for clean testing
    policyManager.reset();
  });

  it("registers tool tags correctly", () => {
    policyManager.registerToolTags("test_tool", ["admin", "custom"]);
    const requiredScope = policyManager.getRequiredScope("test_tool");
    expect(requiredScope).toBe("mcp:tools:admin");
  });

  it("defaults to mcp:tools:execute if no tags or unrecognized tags are specified", () => {
    policyManager.registerToolTags("standard_tool", ["unknown"]);
    expect(policyManager.getRequiredScope("standard_tool")).toBe("mcp:tools:execute");

    policyManager.registerToolTags("no_tag_tool", []);
    expect(policyManager.getRequiredScope("no_tag_tool")).toBe("mcp:tools:execute");

    expect(policyManager.getRequiredScope("unregistered_tool")).toBe("mcp:tools:execute");
  });

  it("resolves required scopes correctly based on tags", () => {
    policyManager.registerToolTags("admin_tool", ["admin"]);
    policyManager.registerToolTags("read_tool", ["read"]);
    policyManager.registerToolTags("exec_tool", ["execute"]);

    expect(policyManager.getRequiredScope("admin_tool")).toBe("mcp:tools:admin");
    expect(policyManager.getRequiredScope("read_tool")).toBe("mcp:tools:read");
    expect(policyManager.getRequiredScope("exec_tool")).toBe("mcp:tools:execute");
  });

  it("enforces visibility based on scopes", () => {
    policyManager.registerToolTags("admin_tool", ["admin"]);

    // Missing required scope
    expect(policyManager.isToolVisible("admin_tool", ["mcp:tools:read"])).toBe(false);

    // Has required scope
    expect(policyManager.isToolVisible("admin_tool", ["mcp:tools:admin"])).toBe(true);
  });

  it("supports dynamic disable and enable by key", () => {
    policyManager.registerToolTags("test_tool", ["read"]);

    // Visible initially
    expect(policyManager.isToolVisible("test_tool", ["mcp:tools:read"])).toBe(true);

    // Disable key
    policyManager.disableKey("tool:test_tool");
    expect(policyManager.isToolVisible("test_tool", ["mcp:tools:read"])).toBe(false);

    // Enable key
    policyManager.enableKey("tool:test_tool");
    expect(policyManager.isToolVisible("test_tool", ["mcp:tools:read"])).toBe(true);
  });

  it("supports dynamic disable and enable by tag", () => {
    policyManager.registerToolTags("tool_1", ["admin"]);
    policyManager.registerToolTags("tool_2", ["admin"]);

    // Both visible initially
    expect(policyManager.isToolVisible("tool_1", ["mcp:tools:admin"])).toBe(true);
    expect(policyManager.isToolVisible("tool_2", ["mcp:tools:admin"])).toBe(true);

    // Disable tag
    policyManager.disableTag("admin");
    expect(policyManager.isToolVisible("tool_1", ["mcp:tools:admin"])).toBe(false);
    expect(policyManager.isToolVisible("tool_2", ["mcp:tools:admin"])).toBe(false);

    // Enable tag
    policyManager.enableTag("admin");
    expect(policyManager.isToolVisible("tool_1", ["mcp:tools:admin"])).toBe(true);
    expect(policyManager.isToolVisible("tool_2", ["mcp:tools:admin"])).toBe(true);
  });
});
