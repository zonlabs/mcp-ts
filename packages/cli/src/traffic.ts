import { pc } from "./ux.js";

export interface TrafficOptions {
  onUpdate?: () => void;
}

interface TickerEvent {
  dir: "in" | "out";
  text: string;
}

/**
 * Tracks live gateway traffic for the `serve` daemon: cumulative counters
 * (incoming requests, outgoing tool calls, errors) plus a rolling "last event"
 * line, surfaced through the ux ticker on every update.
 */
export class Traffic {
  requests = 0;
  calls = 0;
  errors = 0;
  private last: TickerEvent | null = null;
  private onUpdate?: () => void;

  constructor(options: TrafficOptions = {}) {
    this.onUpdate = options.onUpdate;
  }

  setOnUpdate(fn: () => void): void {
    this.onUpdate = fn;
  }

  /** An incoming request hit the local endpoint (HTTP) or the bridge (remote invoke). */
  recordIncoming(kind: string, detail: string, ms: number, status = 200): void {
    this.requests++;
    const ok = status >= 200 && status < 300;
    if (!ok) this.errors++;
    const suffix = `${kind}${detail ? ` ${detail}` : ""} ${ms}ms`;
    this.last = { dir: "in", text: ok ? suffix : `${suffix} HTTP ${status}` };
    this.onUpdate?.();
  }

  /** A tool call was dispatched to a local MCP server. */
  recordCall(server: string, tool: string, ms: number, ok: boolean): void {
    this.calls++;
    if (!ok) this.errors++;
    this.last = {
      dir: "out",
      text: `${server}::${tool} ${ms}ms ${ok ? "ok" : "ERR"}`,
    };
    this.onUpdate?.();
  }

  /** An error that was not tied to a specific call/request. */
  recordError(where: string, message: string): void {
    this.errors++;
    this.last = { dir: "in", text: `${where}: ${message}` };
    this.onUpdate?.();
  }

  /** Rolling one-line summary: cumulative counters + last event. */
  render(): string {
    const counters = pc.dim(`req ${this.requests}  call ${this.calls}  err ${this.errors}`);
    if (!this.last) return counters;
    const arrow = this.last.dir === "in" ? pc.green("←") : pc.yellow("→");
    return `${counters}   ${arrow} ${this.last.text}`;
  }
}
