import type { Writable } from "node:stream";
import pc from "picocolors";
import { enableServerConfig, disableServerConfig } from "../gateway/config.js";
import { printBanner, success } from "../ux.js";

export async function cmdEnable(
  name: string,
  dir: string | undefined,
  output: Pick<Writable, "write"> = process.stdout,
): Promise<void> {
  printBanner();
  const { path } = enableServerConfig(name, dir);
  success(`Enabled server "${name}" in ${pc.underline(path)}`);
}

export async function cmdDisable(
  name: string,
  dir: string | undefined,
  output: Pick<Writable, "write"> = process.stdout,
): Promise<void> {
  printBanner();
  const { path } = disableServerConfig(name, dir);
  success(`Disabled server "${name}" in ${pc.underline(path)}`);
}
