import pc from "picocolors";
import { writeDefaultMcpJson } from "../gateway/config.js";
import { intro, outro, printBanner, success, treeNote } from "../ux.js";

export async function cmdInit(dir: string | undefined): Promise<void> {
  printBanner();
  intro(pc.bold("mcpa init"));
  const target = dir ?? process.cwd();
  const path = writeDefaultMcpJson(target);
  success(`Wrote default configuration to ${pc.cyan(path)}`);
  treeNote([
    pc.dim("Configure your local MCP servers, then launch the gateway:"),
    `  ${pc.bold("mcpa serve")}`,
  ]);
  outro(pc.green("Ready!"));
}
