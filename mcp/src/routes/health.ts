import { Hono } from "hono";
import packageJson from "../../package.json";

const app = new Hono();

export interface HealthPayload {
  status: "ok";
  version: string;
  uptime_seconds: number;
}

export function buildHealthPayload(): HealthPayload {
  return {
    status: "ok",
    version: packageJson.version,
    uptime_seconds: Math.max(0, Math.round(process.uptime())),
  };
}

app.get("/", (c) => {
  return c.json(buildHealthPayload());
});

export { app as healthRoutes };
