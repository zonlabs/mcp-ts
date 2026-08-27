import { confirm, isCancel } from "@clack/prompts";

export async function confirmSignIn(): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const response = await confirm({
    message: "Sign in now?",
    initialValue: true,
  });
  return !isCancel(response) && response;
}
