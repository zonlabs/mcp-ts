import { createApp } from "./app";

export default {
  fetch(request: Request, env: unknown, ctx: unknown) {
    return createApp().fetch(request, env, ctx as never);
  },
};
