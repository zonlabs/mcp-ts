import pc from "picocolors";
import { loginToRemote } from "../gateway/oauth.js";
import { intro, outro, printBanner, spinner } from "../ux.js";
import { activateRunningGateway } from "../gateway/activation.js";

interface LoginDependencies {
  login?: typeof loginToRemote;
  activate?: typeof activateRunningGateway;
}

export async function cmdLogin(
  remote: string,
  dependencies: LoginDependencies = {},
): Promise<void> {
  printBanner();
  intro(pc.bold("mcpa login"));
  const spin = spinner();
  spin.start("Waiting for sign-in in your browser...");
  try {
    const result = await (dependencies.login ?? loginToRemote)(remote);
    await (dependencies.activate ?? activateRunningGateway)();
    spin.stop(result.alreadySignedIn ? "Already signed in" : "Sign-in complete");
    outro(pc.green(result.alreadySignedIn ? "Already signed in" : "Signed in successfully"));
  } catch (error) {
    spin.stop("Sign-in failed");
    throw error;
  }
}
