import type { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import pc from "picocolors";
import { intro, outro, log, spinner } from "@clack/prompts";

export function writeLine(stream: Pick<Writable, "write">, text = ""): void {
  stream.write(`${text}\n`);
}

export function fileLink(label: string, path: string): string {
  const text = pc.underline(pc.dim(label));
  if (!process.stdout.isTTY) return text;
  const target = pathToFileURL(path).href;
  return `\u001B]8;;${target}\u001B\\${text}\u001B]8;;\u001B\\`;
}

import { CLI_VERSION } from "./constants.js";

export { CLI_VERSION, pc, intro, outro, spinner };

/**
 * Returns a high-impact, professional block ASCII banner for mcp-ts.
 */
export function renderBanner(version: string = CLI_VERSION): string {
  // Vibrant TrueColor crimson red (rgb 225, 29, 38) matching MCP Assistant brand
  const isColorSupported = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);
  const r = (s: string) => (isColorSupported ? `\x1b[38;2;225;29;38m\x1b[1m${s}\x1b[0m` : pc.red(pc.bold(s)));
  const w = (s: string) => (isColorSupported ? `\x1b[38;2;255;255;255m\x1b[1m${s}\x1b[0m` : pc.white(pc.bold(s)));
  const d = (s: string) => pc.dim(s);
  const tag = pc.bold(pc.cyan(`v${version}`));

  return [
    "",
    "  " + r("███╗   ███╗  ██████╗ ██████╗ ") + "         " + w("██████████╗ ███████╗ "),
    "  " + r("████╗ ████║ ██╔════╝ ██╔══██╗") + "         " + w("╚═══██╔═══╝ ██╔════╝ "),
    "  " + r("██╔████╔██║ ██║      ██████╔╝") + "  " + w("█████╗") + "     " + w("██║     ╚██████╗ "),
    "  " + r("██║╚██╔╝██║ ██║      ██╔═══╝ ") + "  " + w("╚════╝") + "     " + w("██║      ╚════██╗"),
    "  " + r("██║ ╚═╝ ██║ ╚██████╗ ██║     ") + "             " + w("██║     ███████╔╝"),
    "  " + r("╚═╝     ╚═╝  ╚═════╝ ╚═╝     ") + "             " + w("╚═╝     ╚══════╝ ") + "  " + tag,
    "",
    "  " + d("MCP Gateway & Execution Engine for Agents") + "  " + pc.underline(d("https://mcp-assistant.in")),
    "",
  ].join("\n");
}

export function printBanner(version: string = CLI_VERSION): void {
  process.stdout.write(`${renderBanner(version)}\n`);
}

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

/** Write a plain line safely above the active ticker. */
export function dim(message: string): void {
  clearTickerLine();
  process.stdout.write(`${message}\n`);
  reflowTicker();
}

/** Print tree-connected notes along Clack's left vertical rule. */
export function treeNote(lines: string | string[]): void {
  const arr = Array.isArray(lines) ? lines : [lines];
  for (const line of arr) {
    process.stdout.write(`${pc.dim("│")}  ${line}\n`);
  }
}

/** Start a tree-aligned blank line while an active spinner owns the current line. */
export function treeSpacer(): void {
  process.stdout.write(`\n${pc.dim("│")}\n`);
}

/** Print a structured section with bullet points connected to Clack's tree. */
export function treeSummary(
  title: string,
  items: Array<{ label?: string; value: string } | string>,
): void {
  log.info(pc.bold(title));
  for (const item of items) {
    if (typeof item === "string") {
      treeNote(`${pc.dim("•")} ${item}`);
    } else if (item.label) {
      treeNote(
        `${pc.dim("•")} ${pc.dim(item.label.padEnd(9))} ${item.value}`,
      );
    } else {
      treeNote(`${pc.dim("•")} ${item.value}`);
    }
  }
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
  const formatted = `  ${pc.dim("[traffic]")} ${message}`;
  if (tickerTTY) process.stderr.write(`\r\x1b[K${formatted}`);
  else process.stderr.write(`${formatted}\n`);
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
 * Forward a single line of a child MCP server's stderr if verbose is enabled.
 */
export function serverLog(server: string, line: string, verbose = false): void {
  if (!verbose) return;
  clearTickerLine();
  for (const part of line.split(/\r?\n/)) {
    const trimmed = part.trim();
    if (trimmed) {
      process.stdout.write(`${pc.dim(`│  [${server}]`)} ${pc.dim(trimmed)}\n`);
    }
  }
  reflowTicker();
}
