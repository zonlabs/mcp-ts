import { randomUUID } from "node:crypto";

const GENERATION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GatewayMode = "foreground" | "daemon";

export interface GatewayHealth {
  status: "ok";
  pid: number;
  port: number;
  mode: GatewayMode;
  generation: string;
}

export function createGatewayGeneration(): string {
  return randomUUID();
}

export function isGatewayGeneration(value: unknown): value is string {
  return typeof value === "string" && GENERATION_PATTERN.test(value);
}

export function isGatewayHealth(value: unknown): value is GatewayHealth {
  if (!value || typeof value !== "object") return false;
  const health = value as Record<string, unknown>;
  return health.status === "ok"
    && Number.isInteger(health.pid)
    && (health.pid as number) > 0
    && Number.isInteger(health.port)
    && (health.port as number) >= 1
    && (health.port as number) <= 65_535
    && (health.mode === "foreground" || health.mode === "daemon")
    && isGatewayGeneration(health.generation);
}

