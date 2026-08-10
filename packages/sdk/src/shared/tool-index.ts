/**
 * ToolIndex — Lightweight in-memory search index for MCP tool discovery.
 *
 * Supports two search methods:
 *   • BM25      – Okapi BM25 ranking over tokenized tool metadata (zero external deps)
 *   • regex     – Pattern matching against tool names, descriptions, and parameters
 *   • embedding – (optional) cosine-similarity over caller-supplied vectors,
 *                 blended with BM25 scores
 *
 * @packageDocumentation
 */
import type { Tool } from "@modelcontextprotocol/client";

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** Compact summary returned by search — intentionally lightweight. */
export interface ToolSummary {
  /** Fully qualified tool name (e.g. "tool_github_create_pr") */
  name: string;
  /** Human-readable description */
  description: string;
  /** Server that owns this tool */
  serverName: string;
  /** Unique ID of the server */
  serverId: string;
  /** Session the tool belongs to */
  sessionId: string;
}

/** Server-level summary derived from indexed tools. */
export interface ToolServerSummary {
  /** Human-readable server name */
  serverName: string;
  /** Stable server identifier */
  serverId: string;
  /** Session the server belongs to */
  sessionId: string;
  /** Number of indexed tools for this server */
  toolCount: number;
}

/** Optional filters for search and listing. */
export interface ToolSearchOptions {
  /** Restrict results to this server ID. */
  serverId?: string;
  /** Restrict results to servers whose name or ID matches this value. */
  serverName?: string;
}

/** Paginated tool listing result. */
export interface ToolListResult {
  tools: ToolSummary[];
  totalCount: number;
  returnedCount: number;
  nextCursor?: string;
  servers: ToolServerSummary[];
}

export interface ToolLookupOptions {
  /**
   * Allow namespace to match a fragment of serverName after exact
   * sessionId/serverId matching fails.
   */
  allowServerNameFragment?: boolean;
}

/** A tool with routing metadata attached during indexing. */
export interface IndexedTool extends Tool {
  sessionId: string;
  serverId: string;
  serverName: string;
  outputSchema?: Tool['outputSchema'];
}

/**
 * An optional embedding function supplied by the consumer.
 * Should accept an array of strings and return a matching array of
 * float-number arrays (one embedding vector per input string).
 */
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export interface ToolIndexOptions {
  /**
   * Custom embedding function for semantic search.
   * When provided, `search()` uses cosine-similarity in addition to keywords.
   * @example
   * ```ts
   * import { embed } from 'ai';
   * const embedFn: EmbedFn = async (texts) => {
   *   const { embeddings } = await embed({ model: openai('text-embedding-3-small'), values: texts });
   *   return embeddings;
   * };
   * ```
   */
  embedFn?: EmbedFn;

  /**
   * Relative weight of keyword score vs embedding score when both are active.
   * 0 = embedding only · 1 = keyword only · 0.4 (default) blends both.
   * @default 0.4
   */
  keywordWeight?: number;
}

// ---------------------------------------------------------------------------
// ToolIndex
// ---------------------------------------------------------------------------

export class ToolIndex {
  /** All indexed tools keyed by name (supports duplicates). */
  private tools = new Map<string, IndexedTool[]>();

  /** Precomputed lightweight summaries keyed by document. */
  private toolSummaries = new Map<string, ToolSummary>();

  /** Pre-computed search text for keyword matching (lowercase), keyed by document. */
  private searchTexts = new Map<string, string>();

  /** Pre-computed IDF values per token (computed once on build). */
  private idf = new Map<string, number>();

  /** Per-tool TF vectors (Map<token, tf>). */
  private tfVectors = new Map<string, Map<string, number>>();

  /** Optional: pre-computed embedding vectors per tool. */
  private embeddings = new Map<string, number[]>();

  /** BM25: document lengths in tokens for each tool. */
  private docLengths = new Map<string, number>();

  /** BM25: average document length across the entire index. */
  private avgDocLength = 0;

  private options: Required<ToolIndexOptions>;

  constructor(options: ToolIndexOptions = {}) {
    this.options = {
      embedFn: options.embedFn ?? (undefined as unknown as EmbedFn),
      keywordWeight: options.keywordWeight ?? 0.4,
    };
  }

  // -----------------------------------------------------------------------
  // Indexing
  // -----------------------------------------------------------------------

  /**
   * Build (or rebuild) the index from the given tool set.
   * Call this after connecting / reconnecting to MCP servers.
   */
  async buildIndex(tools: IndexedTool[]): Promise<void> {
    this.tools.clear();
    this.toolSummaries.clear();
    this.searchTexts.clear();
    this.idf.clear();
    this.tfVectors.clear();
    this.embeddings.clear();
    this.docLengths.clear();
    this.avgDocLength = 0;

    // 1. Populate tool map + search text
    const allTokenSets: Map<string, Set<string>> = new Map();
    let totalLength = 0;

    for (const tool of tools) {
      const docKey = this.getDocumentKey(tool);

      if (!this.tools.has(tool.name)) {
        this.tools.set(tool.name, []);
      }
      this.tools.get(tool.name)!.push(tool);
      this.toolSummaries.set(docKey, {
        name: tool.name,
        description: tool.description ?? '',
        serverName: tool.serverName,
        serverId: tool.serverId,
        sessionId: tool.sessionId,
      });

      const rawText = this.buildSearchableText(tool);
      const text = rawText.toLowerCase();
      this.searchTexts.set(docKey, text);

      const tokens = this.tokenize(rawText);
      const tf = new Map<string, number>();
      const uniqueTokens = new Set<string>();

      for (const tok of tokens) {
        tf.set(tok, (tf.get(tok) ?? 0) + 1);
        uniqueTokens.add(tok);
      }

      // Normalize TF
      const maxTf = Math.max(...tf.values(), 1);
      for (const [k, v] of tf) {
        tf.set(k, v / maxTf);
      }

      this.tfVectors.set(docKey, tf);
      allTokenSets.set(docKey, uniqueTokens);

      const length = tokens.length;
      this.docLengths.set(docKey, length);
      totalLength += length;
    }

    // Compute average document length
    this.avgDocLength = totalLength / (tools.length || 1);

    // 2. Compute IDF
    const totalDocs = tools.length || 1;
    const dfCounts = new Map<string, number>();

    for (const tokenSet of allTokenSets.values()) {
      for (const tok of tokenSet) {
        dfCounts.set(tok, (dfCounts.get(tok) ?? 0) + 1);
      }
    }

    for (const [tok, df] of dfCounts) {
      this.idf.set(tok, Math.log(totalDocs / df) + 1);
    }

    // 3. Build embeddings if an embedFn was provided
    if (this.options.embedFn) {
      const names = [...this.searchTexts.keys()];
      const texts = names.map((n) => this.searchTexts.get(n)!);

      try {
        const vectors = await this.options.embedFn(texts);
        for (let i = 0; i < names.length; i++) {
          if (vectors[i]) {
            this.embeddings.set(names[i], vectors[i]);
          }
        }
      } catch (err) {
        console.warn('[ToolIndex] Embedding generation failed, falling back to keyword-only search:', err);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  /**
   * Search the index and return the top-K most relevant tools.
   *
   * When an `embedFn` is configured the final score is a weighted blend of
   * keyword TF-IDF similarity and embedding cosine-similarity:
   *
   *   `score = keywordWeight × keyword_score + (1 - keywordWeight) × cosine_score`
   */
  async search(query: string, topK = 5, options: ToolSearchOptions = {}): Promise<ToolSummary[]> {
    if (this.tools.size === 0) return [];

    const queryLower = query.toLowerCase().trim();

    // Fast path: Exact tool name match (supports duplicate names across servers)
    const exactMatches = [...this.toolSummaries.values()].filter(
      (summary) => summary.name.toLowerCase() === queryLower && this.matchesServer(summary, options)
    );
    if (exactMatches.length > 0) {
      return exactMatches.slice(0, topK);
    }

    // Fast path: MCP prefix match (e.g. "mcp__github")
    if (queryLower.startsWith('mcp__') && queryLower.length > 5) {
      const prefixMatches = [...this.toolSummaries.values()]
        .filter((t) => t.name.toLowerCase().startsWith(queryLower) && this.matchesServer(t, options))
        .slice(0, topK);
      if (prefixMatches.length > 0) return prefixMatches;
    }

    const queryTermsRaw = queryLower.split(/\s+/).filter((t) => t.length > 0);
    const requiredTerms: string[] = [];
    const optionalTerms: string[] = [];

    for (const term of queryTermsRaw) {
      if (term.startsWith('+') && term.length > 1) {
        requiredTerms.push(term.slice(1));
      } else {
        optionalTerms.push(term);
      }
    }

    const allScoringTerms =
      requiredTerms.length > 0 ? [...requiredTerms, ...optionalTerms] : queryTermsRaw;
    const normalizedQueryText = allScoringTerms.join(' ').trim();
    const queryTokens = this.tokenize(allScoringTerms.join(' '));

    // Pre-filter: only keep documents that contain ALL required terms
    const candidateKeys = new Set<string>();
    for (const docKey of this.toolSummaries.keys()) {
      const summary = this.toolSummaries.get(docKey)!;
      if (!this.matchesServer(summary, options)) continue;

      if (requiredTerms.length > 0) {
        const text = this.searchTexts.get(docKey) || '';
        const nameLower = summary.name.toLowerCase();
        const matchesAll = requiredTerms.every(
          (term) => text.includes(term) || nameLower.includes(term)
        );
        if (!matchesAll) continue;
      }
      candidateKeys.add(docKey);
    }

    // 1. Keyword scores (BM25)
    const keywordScores = new Map<string, number>();

    const k1 = 1.2;
    const b = 0.75;

    for (const docKey of candidateKeys) {
      const docTf = this.tfVectors.get(docKey);
      if (!docTf) continue;
      
      const summary = this.toolSummaries.get(docKey)!;

      let score = 0;
      const docLen = this.docLengths.get(docKey) ?? 0;

      for (const tok of queryTokens) {
        const tfVal = docTf.get(tok) ?? 0;
        if (tfVal === 0) continue;

        const idf = this.idf.get(tok) ?? 0;
        // BM25 formula:
        // score = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgDocLength)))
        const numerator = tfVal * (k1 + 1);
        const denominator = tfVal + k1 * (1 - b + b * (docLen / this.avgDocLength));

        score += idf * (numerator / denominator);
      }

      // Name heuristics: give massive boosts for exact server/tool name matches
      const serverLower = (summary.serverName || summary.serverId || '').toLowerCase();
      const toolLower = summary.name.toLowerCase();

      for (const term of allScoringTerms) {
        if (serverLower.includes(term)) {
          score += 10;
        }
        if (toolLower.includes(term)) {
          score += 5;
        }
      }

      if (score > 0) {
        keywordScores.set(docKey, score);
      }
    }

    // 2. Embedding scores (optional)
    let embeddingScores: Map<string, number> | null = null;

    if (this.options.embedFn && this.embeddings.size > 0) {
      try {
        const [queryEmbedding] = await this.options.embedFn([normalizedQueryText]);
        if (queryEmbedding) {
          embeddingScores = new Map();
          for (const docKey of candidateKeys) {
            const vec = this.embeddings.get(docKey);
            if (vec) {
              embeddingScores.set(docKey, this.cosineSimilarity(queryEmbedding, vec));
            }
          }
        }
      } catch {
        // Silently fall back to keyword only for this query
      }
    }

    // 3. Blend scores
    const kw = this.options.keywordWeight;
    const finalScores: Array<{ docKey: string; score: number }> = [];

    for (const docKey of candidateKeys) {
      const kwScore = keywordScores.get(docKey) ?? 0;
      const embScore = embeddingScores?.get(docKey) ?? 0;

      const score = embeddingScores ? kw * kwScore + (1 - kw) * embScore : kwScore;

      if (score > 0) {
        finalScores.push({ docKey, score });
      }
    }

    // 4. Sort and return top-K
    finalScores.sort((a, b) => b.score - a.score);

    return finalScores.slice(0, topK).map(({ docKey }) => {
      return this.toolSummaries.get(docKey)!;
    });
  }

  /**
   * Search tools using a regex pattern.
   * Matches against name, description, and parameter metadata.
   */
  searchRegex(pattern: string, topK = 5): ToolSummary[] {
    if (this.tools.size === 0) return [];

    try {
      // Handle Anthropic-style (?i) case-insensitive flag which JS doesn't support natively in string
      let flags = '';
      let cleanPattern = pattern;
      if (pattern.includes('(?i)')) {
        flags = 'i';
        cleanPattern = pattern.replace(/\(\?i\)/g, '');
      }

      const regex = new RegExp(cleanPattern, flags || undefined);
      const matches: Array<{ docKey: string; score: number }> = [];

      for (const [docKey, text] of this.searchTexts) {
        const tool = this.toolSummaries.get(docKey);
        if (!tool) continue;

        if (regex.test(text) || regex.test(tool.name)) {
          // Use a simple heuristic for ranking regex matches: 
          // 1. Exact name match (highest)
          // 2. Name starts with pattern
          // 3. Name contains pattern
          // 4. Description contains pattern (lowest)
          let score = 1;
          if (tool.name === cleanPattern) score = 10;
          else if (tool.name.startsWith(cleanPattern)) score = 5;
          else if (tool.name.toLowerCase().includes(cleanPattern.toLowerCase())) score = 2;

          matches.push({ docKey, score });
        }
      }

      matches.sort((a, b) => b.score - a.score);

      return matches.slice(0, topK).map(({ docKey }) => {
        return this.toolSummaries.get(docKey)!;
      });
    } catch (err) {
      console.warn('[ToolIndex] Regex search failed:', err);
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /**
   * Get tool definition(s) by name.
   * If namespace is provided, exact sessionId/serverId matches take precedence.
   * Falls back to serverName fragment matching only when explicitly allowed.
   */
  getTool(name: string, namespace?: string, options: ToolLookupOptions = {}): IndexedTool[] {
    const list = this.tools.get(name) ?? [];
    if (!namespace) return list;

    const exactMatches = list.filter(
      (t) => t.sessionId === namespace || t.serverId === namespace
    );
    if (exactMatches.length > 0) return exactMatches;

    if (!options.allowServerNameFragment) return [];

    const namespaceLower = namespace.toLowerCase();
    return list.filter((t) => t.serverName.toLowerCase().includes(namespaceLower));
  }

  /** All indexed tool names. */
  getToolNames(): string[] {
    return [...this.tools.keys()];
  }

  /** List indexed servers with tool counts. */
  listServers(options: ToolSearchOptions = {}): ToolServerSummary[] {
    const servers = new Map<string, ToolServerSummary>();

    for (const summary of this.toolSummaries.values()) {
      if (!this.matchesServer(summary, options)) continue;

      const key = `${summary.sessionId}::${summary.serverId}`;
      const existing = servers.get(key);
      if (existing) {
        existing.toolCount += 1;
      } else {
        servers.set(key, {
          serverName: summary.serverName,
          serverId: summary.serverId,
          sessionId: summary.sessionId,
          toolCount: 1,
        });
      }
    }

    return [...servers.values()].sort((a, b) => {
      const byName = a.serverName.localeCompare(b.serverName);
      return byName !== 0 ? byName : a.serverId.localeCompare(b.serverId);
    });
  }

  /** List tools deterministically, optionally scoped to a server. */
  listTools(options: ToolSearchOptions & { limit?: number; cursor?: string } = {}): ToolListResult {
    const offset = Math.max(Number(options.cursor) || 0, 0);
    const limit = Math.max(Number(options.limit) || 20, 1);
    const tools = [...this.toolSummaries.values()]
      .filter((summary) => this.matchesServer(summary, options))
      .sort((a, b) => {
        const byServer = a.serverName.localeCompare(b.serverName);
        if (byServer !== 0) return byServer;
        return a.name.localeCompare(b.name);
      });

    const page = tools.slice(offset, offset + limit);
    const nextOffset = offset + page.length;

    return {
      tools: page,
      totalCount: tools.length,
      returnedCount: page.length,
      nextCursor: nextOffset < tools.length ? String(nextOffset) : undefined,
      servers: this.listServers(options),
    };
  }

  /** Number of indexed tools (including duplicates). */
  get size(): number {
    let count = 0;
    for (const list of this.tools.values()) {
      count += list.length;
    }
    return count;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Build a single searchable string from tool metadata. */
  private buildSearchableText(tool: Tool): string {
    const parts: string[] = [tool.name];
    if (tool.description) parts.push(tool.description);

    if (tool.inputSchema && typeof tool.inputSchema === 'object') {
      this.collectSchemaSearchText(tool.inputSchema, parts);
    }

    return parts.join(' ');
  }

  /** Recursively collect JSON Schema argument names and descriptions. */
  private collectSchemaSearchText(
    schema: unknown,
    parts: string[],
    seen = new WeakSet<object>()
  ): void {
    if (!schema || typeof schema !== 'object') return;
    if (seen.has(schema)) return;
    seen.add(schema);

    if (Array.isArray(schema)) {
      for (const item of schema) {
        this.collectSchemaSearchText(item, parts, seen);
      }
      return;
    }

    const schemaObject = schema as Record<string, unknown>;
    this.pushStringValue(schemaObject.description, parts);
    this.pushStringValue(schemaObject.title, parts);

    const properties = schemaObject.properties;
    if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
      for (const [propertyName, propertySchema] of Object.entries(properties)) {
        parts.push(propertyName);
        this.collectSchemaSearchText(propertySchema, parts, seen);
      }
    }

    const patternProperties = schemaObject.patternProperties;
    if (
      patternProperties &&
      typeof patternProperties === 'object' &&
      !Array.isArray(patternProperties)
    ) {
      for (const [propertyPattern, propertySchema] of Object.entries(patternProperties)) {
        parts.push(propertyPattern);
        this.collectSchemaSearchText(propertySchema, parts, seen);
      }
    }

    const dependentSchemas = schemaObject.dependentSchemas;
    if (
      dependentSchemas &&
      typeof dependentSchemas === 'object' &&
      !Array.isArray(dependentSchemas)
    ) {
      for (const [propertyName, dependentSchema] of Object.entries(dependentSchemas)) {
        parts.push(propertyName);
        this.collectSchemaSearchText(dependentSchema, parts, seen);
      }
    }

    for (const key of [
      'items',
      'additionalProperties',
      'contains',
      'propertyNames',
      'if',
      'then',
      'else',
      'not',
    ]) {
      this.collectSchemaSearchText(schemaObject[key], parts, seen);
    }

    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
      this.collectSchemaSearchText(schemaObject[key], parts, seen);
    }

    for (const key of ['$defs', 'definitions']) {
      const definitions = schemaObject[key];
      if (definitions && typeof definitions === 'object' && !Array.isArray(definitions)) {
        for (const [definitionName, definitionSchema] of Object.entries(definitions)) {
          parts.push(definitionName);
          this.collectSchemaSearchText(definitionSchema, parts, seen);
        }
      }
    }
  }

  private pushStringValue(value: unknown, parts: string[]): void {
    if (typeof value === 'string' && value.trim()) {
      parts.push(value);
    }
  }

  private getDocumentKey(tool: IndexedTool): string {
    return `${tool.sessionId}::${tool.serverId}::${tool.name}`;
  }

  private matchesServer(summary: ToolSummary, options: ToolSearchOptions): boolean {
    if (options.serverId && summary.serverId !== options.serverId) {
      return false;
    }

    if (options.serverName) {
      const serverNameQuery = options.serverName.toLowerCase();
      const serverName = summary.serverName.toLowerCase();
      const serverId = summary.serverId.toLowerCase();
      if (!serverName.includes(serverNameQuery) && !serverId.includes(serverNameQuery)) {
        return false;
      }
    }

    return true;
  }

  /** Simple whitespace + camelCase + snake_case tokenizer. */
  private tokenize(text: string): string[] {
    return text
      // Split camelCase: "getWeather" → "get Weather"
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Split snake_case / kebab-case
      .replace(/[_-]/g, ' ')
      .toLowerCase()
      // Remove non-alphanumeric (except spaces)
      .replace(/[^a-z0-9\s]/g, '')
      // Split on whitespace
      .split(/\s+/)
      .filter((t) => t.length > 1); // drop single-char noise
  }

  /** Cosine similarity between two vectors. */
  private cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom > 0 ? dot / denom : 0;
  }
}
