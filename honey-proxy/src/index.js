/**
 * Honey API Proxy — Cloudflare Worker
 *
 * Routes:
 *   POST /          → forward to Anthropic (AI proxy)
 *   GET  /sync?key= → pull synced data from KV
 *   POST /sync      → push synced data to KV (body: {key, data})
 *
 * Secrets:
 *   ANTHROPIC_KEY   — set via: wrangler secret put ANTHROPIC_KEY
 *
 * KV namespace:
 *   HONEY_SYNC      — bound in wrangler.toml; create with:
 *                     wrangler kv namespace create honey-sync
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowed === '*' ? '*' : origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (allowed !== '*' && origin !== allowed) {
      return new Response('Forbidden', { status: 403 });
    }

    const url = new URL(request.url);

    // ── Sync routes ──────────────────────────────────────────────────────────

    if (url.pathname === '/sync') {
      if (!env.HONEY_SYNC) {
        return new Response(
          JSON.stringify({ error: 'Sync not configured — HONEY_SYNC KV namespace not bound' }),
          { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Pull: GET /sync?key=<syncKey>
      if (request.method === 'GET') {
        const key = url.searchParams.get('key');
        if (!key || key.length < 16) {
          return new Response(
            JSON.stringify({ error: 'Missing or invalid sync key' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
        const stored = await env.HONEY_SYNC.get(key);
        if (stored === null) {
          return new Response(null, { status: 404, headers: corsHeaders });
        }
        return new Response(stored, {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // Push: POST /sync  body: {key, data}
      if (request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch {
          return new Response(
            JSON.stringify({ error: 'Invalid JSON' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
        const { key, data } = body || {};
        if (!key || key.length < 16 || !data) {
          return new Response(
            JSON.stringify({ error: 'Missing key or data' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
        await env.HONEY_SYNC.put(key, JSON.stringify(data));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    // ── AI proxy route ───────────────────────────────────────────────────────

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    if (!env.ANTHROPIC_KEY) {
      return new Response(
        JSON.stringify({ error: { message: 'ANTHROPIC_KEY secret not set on Worker' } }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: { message: 'Invalid JSON body' } }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();

    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};
