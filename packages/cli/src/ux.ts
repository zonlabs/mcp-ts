import pc from "picocolors";
import { intro, outro, log, spinner } from "@clack/prompts";

export { pc, intro, outro, spinner };

export function step(message: string): void {
  log.step(message);
}

export function success(message: string): void {
  log.success(message);
}

export function info(message: string): void {
  log.info(message);
}

export function warn(message: string): void {
  log.warn(message);
}

export function error(message: string): void {
  log.error(message);
}

/** Write a plain (unboxed, dimmed) line to stdout. */
export function dim(message: string): void {
  process.stdout.write(`${pc.dim(message)}\n`);
}

let tickerMessage = "";
const tickerTTY = Boolean(process.stderr.isTTY);

/**
 * Live status ticker: a single line on stderr, redrawn in place. When stderr is
 * not a TTY (piped/redirected) it falls back to emitting each update as a plain
 * line so nothing is lost.
 */
export function ticker(message: string): void {
  tickerMessage = message;
  if (tickerTTY) process.stderr.write(`\r\x1b[K${message}`);
  else process.stderr.write(`${message}\n`);
}

/** Erase the ticker line on screen (keeps the message so it can be redrawn). */
function clearTickerLine(): void {
  if (tickerTTY) process.stderr.write("\r\x1b[K");
}

/** Redraw the last ticker message after other output has been written. */
function reflowTicker(): void {
  if (tickerMessage) ticker(tickerMessage);
}

/** Permanently remove the ticker (used on shutdown). */
export function clearTicker(): void {
  tickerMessage = "";
  clearTickerLine();
}

/**
 * Forward a single line of a child MCP server's stderr, prefixed and dimmed,
 * so server chatter no longer bleeds raw into the CLI output. The live ticker
 * is cleared first and redrawn afterwards so both stay intact.
 */
export function serverLog(server: string, line: string): void {
  clearTickerLine();
  for (const part of line.split(/\r?\n/)) {
    const trimmed = part.trim();
    if (trimmed) {
      process.stdout.write(`${pc.dim(`└─ [${server}]`)} ${pc.dim(trimmed)}\n`);
    }
  }
  reflowTicker();
}

/** Draw a compact status panel (bordered box) for long-running commands. */
export function panel(rows: Array<[string, string]>): void {
  const labelWidth = Math.max(...rows.map(([k]) => k.length));
  const contentWidth = Math.max(...rows.map(([, v]) => v.length));
  const width = Math.min(labelWidth + contentWidth + 3, 72);
  const rule = pc.dim("─".repeat(width));
  const lines: string[] = [pc.dim("┌") + rule + pc.dim("┐")];
  for (const [k, v] of rows) {
    const plain = ` ${k.padEnd(labelWidth)}  ${v}`.padEnd(width);
    const row = " " + pc.bold(plain.slice(1, 1 + labelWidth)) + plain.slice(1 + labelWidth);
    lines.push(pc.dim("│") + row + pc.dim("│"));
  }
  lines.push(pc.dim("└") + rule + pc.dim("┘"));
  process.stdout.write(`${lines.join("\n")}\n`);
}
