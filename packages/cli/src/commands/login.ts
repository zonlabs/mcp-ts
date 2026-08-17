import pc from "picocolors";
import { loginToRemote } from "../gateway/oauth.js";
import { intro, outro, printBanner, spinner } from "../ux.js";

export async function cmdLogin(remote: string, loginBase?: string): Promise<void> {
  printBanner();
  intro(pc.bold("mcpa login"));
  const spin = spinner();
  spin.start("Waiting for sign-in in your browser...");
  try {
    await loginToRemote(remote, loginBase);
    spin.stop("Sign-in complete");
    outro(pc.green("Signed in successfully"));
  } catch (error) {
    spin.stop("Sign-in failed");
    throw error;
  }
}
