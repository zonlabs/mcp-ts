import { createApp } from "./app";
import { DeviceConnection } from "./device";
import { handleConnect } from "./routes/connect";

export { DeviceConnection };

export default {
  fetch(request: Request, env: Record<string, unknown>, ctx: unknown) {
    if (env && typeof env === "object") {
      Object.assign(process.env, env);
    }
    // Bypass Hono for the WebSocket upgrade so global middlewares (cors,
    // env copy) cannot interfere with the 101 handshake.
    if (new URL(request.url).pathname === "/connect") {
      return handleConnect(request, env);
    }
    return createApp().fetch(request, env, ctx as never);
  },
};
