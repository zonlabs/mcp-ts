import pc from "picocolors";

export interface TrafficOptions {
  verbose?: boolean;
  onUpdate?: () => void;
  onLine?: (line: string) => void;
}

export interface IncomingTrafficInfo {
  protocol?: string;
  method: string;
  target?: string;
  latencyMs?: number;
  status?: number;
  ok?: boolean;
  error?: string;
  args?: unknown;
}

function formatTime(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatStatus(status?: number, ok = true): string {
  if (status !== undefined) {
    if (status >= 200 && status < 300) {
      return pc.green(`${status} OK `);
    }
    return pc.red(`${status} ERR`);
  }
  return ok ? pc.green("200 OK ") : pc.red("500 ERR");
}

function formatLatency(ms?: number): string {
  if (ms === undefined) return "";
  const str = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  return pc.dim(`(${str})`);
}

function truncateString(str: string, maxLength = 100): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 1)}…`;
}

/**
 * Tracks live gateway traffic for the `serve` daemon: cumulative counters
 * plus real-time streaming JSON-RPC and execution logs.
 */
export class Traffic {
  requests = 0;
  calls = 0;
  errors = 0;
  verbose: boolean;
  private onUpdate?: () => void;
  private onLine?: (line: string) => void;

  constructor(options: TrafficOptions = {}) {
    this.verbose = Boolean(options.verbose);
    this.onUpdate = options.onUpdate;
    this.onLine = options.onLine;
  }

  setOnUpdate(fn: () => void): void {
    this.onUpdate = fn;
  }

  setOnLine(fn: (line: string) => void): void {
    this.onLine = fn;
  }

  private emit(line: string): void {
    if (this.onLine) {
      this.onLine(line);
    } else {
      process.stdout.write(`${line}\n`);
    }
    this.onUpdate?.();
  }

  /** An incoming JSON-RPC request hit the local HTTP endpoint or bridge. */
  recordIncoming(kind: string | IncomingTrafficInfo, detail = "", ms?: number, status = 200): void {
    this.requests++;
    const time = pc.dim(formatTime());
    const arrow = pc.green("←");

    if (typeof kind === "object") {
      const info = kind;
      const ok = info.ok !== undefined ? info.ok : (info.status === undefined || (info.status >= 200 && info.status < 300));
      if (!ok) this.errors++;

      const protocol = pc.bold(pc.cyan((info.protocol ?? "JSON-RPC").padEnd(8)));
      const opText = info.target ? `${info.method} (${info.target})` : info.method;
      const opPadded = opText.padEnd(32);
      const statusBadge = info.latencyMs !== undefined ? formatStatus(info.status, ok) : "";
      const latency = formatLatency(info.latencyMs);
      const errNote = info.error ? pc.red(` • ${truncateString(info.error)}`) : "";

      const mainLine = `  ${time}  ${arrow}  ${protocol}  ${opPadded}  ${statusBadge}  ${latency}${errNote}`.trimEnd();
      this.emit(mainLine);

      if (this.verbose && info.args !== undefined) {
        const json = typeof info.args === "string" ? info.args : JSON.stringify(info.args);
        this.emit(`             ${pc.dim("├─ args:")} ${pc.dim(truncateString(json, 200))}`);
      }
      return;
    }

    const ok = status >= 200 && status < 300;
    if (!ok) this.errors++;

    const protocol = pc.bold(pc.cyan("JSON-RPC".padEnd(8)));
    const opText = detail ? `${kind} (${detail})` : kind;
    const opPadded = opText.padEnd(32);
    const statusBadge = formatStatus(status, ok);
    const latency = formatLatency(ms);

    const mainLine = `  ${time}  ${arrow}  ${protocol}  ${opPadded}  ${statusBadge}  ${latency}`.trimEnd();
    this.emit(mainLine);
  }

  /** A tool call was dispatched to a local or remote MCP server. */
  recordCall(
    server: string,
    tool: string,
    ms: number,
    ok: boolean,
    errorMessage?: string,
    args?: unknown,
    result?: unknown,
  ): void {
    this.calls++;
    if (!ok) this.errors++;

    const time = pc.dim(formatTime());
    const arrow = pc.yellow("→");
    const protocol = pc.bold(pc.yellow("EXECUTE ".padEnd(8)));
    const target = `${server}::${tool}`.padEnd(32);
    const statusBadge = formatStatus(undefined, ok);
    const latency = formatLatency(ms);
    const errNote = errorMessage ? pc.red(` • ${truncateString(errorMessage)}`) : "";

    const mainLine = `  ${time}  ${arrow}  ${protocol}  ${target}  ${statusBadge}  ${latency}${errNote}`.trimEnd();
    this.emit(mainLine);

    if (this.verbose) {
      if (args !== undefined) {
        const json = typeof args === "string" ? args : JSON.stringify(args);
        this.emit(`             ${pc.dim("├─ args:")} ${pc.dim(truncateString(json, 200))}`);
      }
      if (result !== undefined) {
        const json = typeof result === "string" ? result : JSON.stringify(result);
        this.emit(`             ${pc.dim("└─ result:")} ${pc.dim(truncateString(json, 200))}`);
      }
    }
  }

  /** An error that was not tied to a specific call/request. */
  recordError(where: string, message: string): void {
    this.errors++;
    const time = pc.dim(formatTime());
    const arrow = pc.red("!");
    const protocol = pc.bold(pc.red("ERROR   ".padEnd(8)));
    const target = where.padEnd(32);
    const statusBadge = pc.red("ERR    ");
    const errNote = pc.red(` • ${truncateString(message)}`);

    const mainLine = `  ${time}  ${arrow}  ${protocol}  ${target}  ${statusBadge}  ${errNote}`.trimEnd();
    this.emit(mainLine);
  }

  /** Cumulative summary string. */
  render(): string {
    return pc.dim(`req ${this.requests}  call ${this.calls}  err ${this.errors}`);
  }
}
