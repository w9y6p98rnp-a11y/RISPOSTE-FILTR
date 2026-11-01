import { onRequestPost as onReplyPost } from './reply.js';
import { onAuthRequest, getSession } from './auth.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const authResponse = await onAuthRequest(request, env, ctx);
    if (authResponse) return authResponse;

    if (request.method === 'POST' && url.pathname === '/api/reply') {
      const user = await getSession(request, env);
      if (!user) {
        return new Response(JSON.stringify({ error: 'Devi effettuare l\'accesso.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return onReplyPost({ request, env, waitUntil: ctx.waitUntil.bind(ctx), user });
    }

    return env.ASSETS.fetch(request);
  }
};
