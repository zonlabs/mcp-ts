import { createApp } from "./app";

export default {
  fetch(request: Request, env: Record<string, unknown>, ctx: unknown) {
    if (env && typeof env === "object") {
      Object.assign(process.env, env);
    }
    return createApp().fetch(request, env, ctx as never);
  },
};
