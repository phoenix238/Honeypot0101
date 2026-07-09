/**
 * Honey API Proxy — Cloudflare Worker
 *
 * Routes:
 *   POST /                        → forward to Anthropic (AI proxy)
 *   GET  /sync?key=                → pull synced data from KV
 *   POST /sync                     → push synced data to KV (body: {key, data})
 *   GET  /starling/status          → check the Starling connection is configured + reachable
 *   GET  /starling/transactions?since=YYYY-MM-DD  → normalized bank feed items since a date
 *
 * Secrets:
 *   ANTHROPIC_KEY   — set via: wrangler secret put ANTHROPIC_KEY
 *   STARLING_TOKEN  — set via: wrangler secret put STARLING_TOKEN
 *                     (a Starling Personal Access Token with transactions:read + accounts:read)
 *
 * KV namespace:
 *   HONEY_SYNC      — bound in wrangler.toml; create with:
 *                     wrangler kv namespace create honey-sync
 */

const STARLING_API = 'https://api.starlingbank.com/api/v2';

// Fetch the primary account + its default spending category from Starling.
// Cached in KV for an hour since it almost never changes, to save a round trip per sync.
async function getStarlingAccount(env) {
  if (env.HONEY_SYNC) {
    const cached = await env.HONEY_SYNC.get('starling-account-cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.cachedAt < 3600000) return parsed;
    }
  }
  const res = await fetch(`${STARLING_API}/accounts`, {
    headers: { Authorization: `Bearer ${env.STARLING_TOKEN}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Starling /accounts returned ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const account = (data.accounts || [])[0];
  if (!account) throw new Error('No Starling account found for this token');
  const result = {
    accountUid: account.accountUid,
    categoryUid: account.defaultCategory,
    name: account.name || account.accountType || 'Starling account',
    cachedAt: Date.now(),
  };
  if (env.HONEY_SYNC) await env.HONEY_SYNC.put('starling-account-cache', JSON.stringify(result));
  return result;
}

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

    // ── Starling bank routes ────────────────────────────────────────────────────

    if (url.pathname === '/starling/status') {
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      }
      if (!env.STARLING_TOKEN) {
        return new Response(JSON.stringify({ ok: false, error: 'STARLING_TOKEN secret not set on Worker' }), {
          status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      try {
        const account = await getStarlingAccount(env);
        return new Response(JSON.stringify({ ok: true, accountLabel: account.name }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    if (url.pathname === '/starling/transactions') {
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      }
      if (!env.STARLING_TOKEN) {
        return new Response(JSON.stringify({ error: 'STARLING_TOKEN secret not set on Worker' }), {
          status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      const since = url.searchParams.get('since');
      if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
        return new Response(JSON.stringify({ error: 'since=YYYY-MM-DD query param is required' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      try {
        const account = await getStarlingAccount(env);
        const min = `${since}T00:00:00.000Z`;
        const max = new Date().toISOString();
        const feedUrl = `${STARLING_API}/feed/account/${account.accountUid}/category/${account.categoryUid}/transactions-between?minTransactionTimestamp=${encodeURIComponent(min)}&maxTransactionTimestamp=${encodeURIComponent(max)}`;
        const res = await fetch(feedUrl, {
          headers: { Authorization: `Bearer ${env.STARLING_TOKEN}`, Accept: 'application/json' },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Starling feed returned ${res.status}: ${text.slice(0, 200)}`);
        }
        const data = await res.json();
        const transactions = (data.feedItems || [])
          .filter(item => item.status === 'SETTLED')
          .map(item => ({
            feedItemUid: item.feedItemUid,
            date: (item.transactionTime || '').slice(0, 10),
            description: item.counterPartyName || item.reference || 'Bank transaction',
            amount: Math.round((item.amount?.minorUnits || 0)) / 100,
            direction: item.direction === 'IN' ? 'IN' : 'OUT',
          }))
          .filter(t => t.date && t.amount > 0);
        return new Response(JSON.stringify({ accountLabel: account.name, transactions }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
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
