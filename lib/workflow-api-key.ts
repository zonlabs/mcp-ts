import { createHmac, randomBytes } from "node:crypto";

export const WORKFLOW_API_KEY_PREFIX = "wfmcp_";

export function generateWorkflowApiKeyRaw(): string {
  return WORKFLOW_API_KEY_PREFIX + randomBytes(32).toString("base64url");
}

export function hashWorkflowApiKey(raw: string, pepper: string): string {
  return createHmac("sha256", pepper).update(raw, "utf8").digest("hex");
}

export function requireWorkflowApiKeyPepper(): string {
  const p = process.env.WORKFLOW_API_KEY_PEPPER?.trim();
  if (!p || p.length < 16) {
    throw new Error("WORKFLOW_API_KEY_PEPPER");
  }
  return p;
}
