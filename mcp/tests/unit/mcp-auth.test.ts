import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUser,
  mockSupabaseFrom,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSupabaseFrom: vi.fn(),
}));

vi.mock("../../src/db/supabase", () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
    },
    from: mockSupabaseFrom,
  },
}));

describe("resolveCredentialAndScopes", () => {
  let mockMaybeSingle: any;
  let mockEq: any;
  let mockSelect: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockSupabaseFrom.mockReturnValue({ select: mockSelect });
  });

  it("resolves valid user ID from Supabase JWT and default scopes for regular user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "jwt-user-456" } }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: { role: "user" }, error: null });
    const { resolveCredentialAndScopes } = await import("../../src/core/auth");

    const res = await resolveCredentialAndScopes("valid_jwt_token");

    expect(res).not.toBeNull();
    expect(res?.userId).toBe("jwt-user-456");
    expect(res?.scopes).toEqual(["openid", "email", "profile", "mcp:tools:read", "mcp:tools:execute"]);
    expect(mockGetUser).toHaveBeenCalledWith("valid_jwt_token");
    expect(mockSupabaseFrom).toHaveBeenCalledWith("user_roles");
  });

  it("resolves admin scope from Supabase JWT if user is staff", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "jwt-user-789" } }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: { role: "staff" }, error: null });
    const { resolveCredentialAndScopes } = await import("../../src/core/auth");

    const res = await resolveCredentialAndScopes("valid_jwt_token_admin");

    expect(res).not.toBeNull();
    expect(res?.userId).toBe("jwt-user-789");
    expect(res?.scopes).toContain("mcp:tools:admin");
    expect(res?.scopes).toEqual([
      "openid",
      "email",
      "profile",
      "mcp:tools:read",
      "mcp:tools:execute",
      "mcp:tools:admin",
    ]);
  });

  it("returns null for empty tokens", async () => {
    const { resolveCredentialAndScopes } = await import("../../src/core/auth");

    const res = await resolveCredentialAndScopes("   ");

    expect(res).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});
