import pc from "picocolors";
import { logoutFromRemote } from "../gateway/oauth.js";
import { intro, outro, printBanner } from "../ux.js";

export async function cmdLogout(remote: string): Promise<void> {
  printBanner();
  intro(pc.bold("mcpa logout"));
  await logoutFromRemote(remote);
  outro(pc.green("Signed out"));
}
