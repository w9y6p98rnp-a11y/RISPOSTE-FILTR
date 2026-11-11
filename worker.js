import { onRequestPost as onReplyPost } from './reply.js';
import { onAuthRequest, getSession } from './auth.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const authResponse = await onAuthRequest(request, env, ctx);
    if (authResponse) return authResponse;

    // Aggiornamento protetto dell'URL Quick Tunnel comunicato da Termux.
    if (request.method === 'POST' && url.pathname === '/api/tunnel/register') {
      if (!env.TUNNEL_UPDATE_TOKEN || !env.DB) {
        return new Response(JSON.stringify({ error: 'Registrazione tunnel non configurata.' }), {
          status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }
      const supplied = String(request.headers.get('Authorization') || '');
      const expected = `Bearer ${env.TUNNEL_UPDATE_TOKEN}`;
      if (supplied !== expected) {
        return new Response(JSON.stringify({ error: 'Non autorizzato.' }), {
          status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }
      const body = await request.json().catch(() => ({}));
      let tunnelUrl;
      try {
        const parsed = new URL(String(body.url || ''));
        if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\\.trycloudflare\\.com$/i.test(parsed.hostname) || parsed.pathname !== '/' || parsed.search || parsed.hash) {
          throw new Error('URL non valido');
        }
        tunnelUrl = `${parsed.origin}/v1`;
      } catch (_) {
        return new Response(JSON.stringify({ error: 'URL Quick Tunnel non valido.' }), {
          status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }
      await env.DB.prepare(
        `INSERT INTO tunnel_config (id, base_url, updated_at) VALUES ('ollitert', ?, ?)
         ON CONFLICT(id) DO UPDATE SET base_url=excluded.base_url, updated_at=excluded.updated_at`
      ).bind(tunnelUrl, Date.now()).run();
      return new Response(JSON.stringify({ ok: true, updated: true }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

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
