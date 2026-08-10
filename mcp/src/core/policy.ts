export class McpPolicyManager {
  private toolMetadata = new Map<string, { tags: string[] }>();
  private disabledKeys = new Set<string>();
  private disabledTags = new Set<string>();

  reset(): void {
    this.toolMetadata.clear();
    this.disabledKeys.clear();
    this.disabledTags.clear();
  }

  registerToolTags(name: string, tags: string[]): void {
    this.toolMetadata.set(name, { tags });
  }

  disableKey(key: string): void {
    this.disabledKeys.add(key);
  }

  enableKey(key: string): void {
    this.disabledKeys.delete(key);
  }

  disableTag(tag: string): void {
    this.disabledTags.add(tag);
  }

  enableTag(tag: string): void {
    this.disabledTags.delete(tag);
  }

  getRequiredScope(name: string): string {
    const meta = this.toolMetadata.get(name);
    if (meta && meta.tags) {
      if (meta.tags.includes("admin")) {
        return "mcp:tools:admin";
      }
      if (meta.tags.includes("read")) {
        return "mcp:tools:read";
      }
      if (meta.tags.includes("execute")) {
        return "mcp:tools:execute";
      }
    }
    // Fail-closed default: require execute scope if no known tag scope matches
    return "mcp:tools:execute";
  }

  isToolVisible(name: string, scopes: string[]): boolean {
    // 1. Check dynamic runtime enablement/disablement (FastMCP style)
    if (this.disabledKeys.has(`tool:${name}`)) {
      return false;
    }

    const meta = this.toolMetadata.get(name);
    if (meta && meta.tags) {
      for (const tag of meta.tags) {
        if (this.disabledTags.has(tag)) {
          return false;
        }
      }
    }

    // 2. Check scope authorization
    const requiredScope = this.getRequiredScope(name);
    return scopes.includes(requiredScope);
  }
}

export const policyManager = new McpPolicyManager();
