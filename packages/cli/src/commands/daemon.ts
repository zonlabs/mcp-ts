import type { Writable } from "node:stream";
import pc from "picocolors";
import {
  getDaemonStatus,
  readDaemonLogs,
  spawnDaemon,
  stopDaemon,
} from "../gateway/daemon.js";
import { printBanner, writeLine } from "../ux.js";

export interface DaemonCommandOptions {
  port?: number;
  verbose?: boolean;
  token?: string;
  url?: string;
  lines?: number;
}

export async function cmdDaemon(
  action: string | undefined,
  options: DaemonCommandOptions,
  output: Pick<Writable, "write"> = process.stdout,
): Promise<void> {
  const normalizedAction = (action || "status").toLowerCase();

  switch (normalizedAction) {
    case "start": {
      try {
        const result = await spawnDaemon({
          port: options.port,
          verbose: options.verbose,
          token: options.token,
          url: options.url,
        });
        writeLine(output, pc.green(`✔ MCP Gateway daemon started in background.`));
        writeLine(output, `  ${pc.bold("PID:")}    ${result.pid}`);
        writeLine(output, `  ${pc.bold("Port:")}    ${result.port}`);
        writeLine(output, `  ${pc.bold("Gateway:")} http://127.0.0.1:${result.port}/mcp`);
        writeLine(output, `  ${pc.bold("Logs:")}    ${result.logPath}`);
        writeLine(output);
        writeLine(output, pc.dim(`Run \`mcpa daemon status\` or \`mcpa daemon logs\` to inspect.`));
      } catch (err) {
        writeLine(output, pc.red(`✖ Failed to start daemon: ${(err as Error).message}`));
        process.exitCode = 1;
      }
      break;
    }

    case "stop": {
      const result = await stopDaemon();
      if (result.stopped) {
        writeLine(output, pc.green(`✔ MCP Gateway daemon (PID ${result.pid}) stopped.`));
      } else if (result.pid) {
        writeLine(output, pc.yellow(`• Daemon process (PID ${result.pid}) was not active. Stale PID cleared.`));
      } else {
        writeLine(output, pc.dim("• No background daemon was running."));
      }
      break;
    }

    case "status": {
      printBanner();
      const status = await getDaemonStatus(options.port);
      if (status.running) {
        writeLine(output, pc.bold(pc.green(`● Daemon is running`)));
        writeLine(output, `  ${pc.bold("PID:")}        ${status.pid}`);
        writeLine(output, `  ${pc.bold("Port:")}       ${status.port}`);
        writeLine(output, `  ${pc.bold("Uptime:")}     ${status.uptimeSeconds ?? 0}s`);
        writeLine(
          output,
          `  ${pc.bold("HTTP API:")}   ${
            status.gatewayResponsive ? pc.green("Healthy (200 OK)") : pc.yellow("Starting / Unresponsive")
          }`,
        );
        writeLine(output, `  ${pc.bold("Log file:")}   ${status.logPath}`);
      } else {
        writeLine(output, pc.bold(pc.dim("○ Daemon is stopped")));
        writeLine(output, `  ${pc.dim("Start the background daemon with: ")}${pc.cyan("mcpa daemon start")}`);
      }
      writeLine(output);
      break;
    }

    case "logs": {
      const lines = options.lines ? Number(options.lines) : 50;
      writeLine(output);
      writeLine(output, pc.bold(pc.cyan(`─── Daemon Logs (Last ${lines} lines) ──────────────────────────`)));
      writeLine(output);
      writeLine(output, readDaemonLogs(lines));
      writeLine(output);
      writeLine(output, pc.bold(pc.dim(`─── End of Logs ───────────────────────────────────────────────`)));
      writeLine(output);
      break;
    }

    default: {
      writeLine(output, pc.red(`Unknown daemon command: "${action}".`));
      writeLine(output, `Usage: ${pc.cyan("mcpa daemon <start|stop|status|logs>")}`);
      process.exitCode = 1;
    }
  }
}
