import { watch, type FSWatcher } from "node:fs";
import { dirname } from "node:path";
import { findMcpJson, loadMcpJson, type LoadedConfig } from "./config.js";
import type { McpServersConfig } from "./types.js";

export interface McpConfigWatcherOptions {
  debounceMs?: number;
  onError?: (error: Error) => void;
}

/**
 * Watches mcp.json (or .mcpassistant/mcp.json) on disk and triggers
 * a debounced callback whenever configuration changes occur.
 */
export class McpConfigWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private currentPath: string | null = null;
  private readonly debounceMs: number;
  private readonly onError?: (error: Error) => void;

  constructor(
    private readonly startDir?: string,
    private readonly onReload?: (config: McpServersConfig, loaded: LoadedConfig) => void | Promise<void>,
    options: McpConfigWatcherOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 300;
    this.onError = options.onError;
  }

  /**
   * Starts watching the directory containing mcp.json.
   */
  start(): string | null {
    if (this.watcher) return this.currentPath;

    const found = findMcpJson(this.startDir);
    if (!found) return null;

    this.currentPath = found;
    const watchDir = dirname(found);

    try {
      this.watcher = watch(watchDir, { persistent: false }, (_eventType, filename) => {
        if (!filename) {
          this.scheduleReload();
          return;
        }
        const lower = filename.toLowerCase();
        if (lower === "mcp.json" || lower.endsWith(".json")) {
          this.scheduleReload();
        }
      });

      this.watcher.on("error", (err) => {
        this.onError?.(err instanceof Error ? err : new Error(String(err)));
      });

      return this.currentPath;
    } catch (err) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  private scheduleReload(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        const loaded = loadMcpJson(this.startDir);
        this.currentPath = loaded.path;
        if (this.onReload) {
          await this.onReload(loaded.config, loaded);
        }
      } catch (err) {
        this.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }, this.debounceMs);
  }

  /**
   * Stops watching the filesystem.
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {
        // Ignore watcher close errors
      }
      this.watcher = null;
    }
  }
}
