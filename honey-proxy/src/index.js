/**
 * Honey API Proxy — Cloudflare Worker
 *
 * Routes:
 *   POST /                        → forward to Anthropic (AI proxy)
 *   GET  /sync?key=                → pull synced data from KV
 *   POST /sync                     → push synced data to KV (body: {key, data})
 *   GET  /starling/status          → check the Starling connection is configured + reachable
 *   GET  /starling/transactions?since=YYYY-MM-DD  → normalized bank feed items since a date
 *   GET  /google/authorize         → redirects to Google's OAuth consent screen
 *   GET  /google/callback          → exchanges the auth code, stores the refresh token, redirects home
 *   GET  /google/status            → whether a Google Calendar connection is stored
 *   POST /google/disconnect        → clears the stored Google refresh token
 *   GET  /google/calendar/events?timeMin=&timeMax=  → normalized calendar events in a range
 *   GET  /monzo/status             → check if Monzo is configured
 *   POST /monzo/webhook            → receive Monzo payment notifications (webhook endpoint)
 *   GET  /monzo/transactions       → fetch recent Monzo card income transactions
 *
 * Secrets:
 *   ANTHROPIC_KEY         — set via: wrangler secret put ANTHROPIC_KEY
 *   STARLING_TOKEN        — set via: wrangler secret put STARLING_TOKEN
 *                           (a Starling Personal Access Token with transactions:read + accounts:read)
 *   GOOGLE_CLIENT_ID      — set via: wrangler secret put GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET  — set via: wrangler secret put GOOGLE_CLIENT_SECRET
 *                           (OAuth Web application client; redirect URI must be
 *                           https://<this-worker>/google/callback)
 *   MONZO_API_KEY         — set via: wrangler secret put MONZO_API_KEY
 *                           (Monzo Business API access token)
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

// ── Google Calendar OAuth ──────────────────────────────────────────────────────
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function googleRedirectUri(request) {
  return `${new URL(request.url).origin}/google/callback`;
}

async function getGoogleAccessToken(env) {
  if (!env.HONEY_SYNC) throw new Error('HONEY_SYNC KV namespace not bound — cannot store Google tokens');
  const refreshToken = await env.HONEY_SYNC.get('google-refresh-token');
  if (!refreshToken) throw new Error('Google Calendar is not connected yet');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google token refresh failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.access_token;
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

    const url = new URL(request.url);

    // /google/authorize and /google/callback are hit by a top-level browser navigation
    // (the user's browser going to/from Google's consent screen), not a fetch() from the
    // app's own JS — there's no Origin header to check on those, so they're exempt.
    const isGoogleOAuthHop = url.pathname === '/google/authorize' || url.pathname === '/google/callback';
    if (!isGoogleOAuthHop && allowed !== '*' && origin !== allowed) {
      return new Response('Forbidden', { status: 403 });
    }

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

    // ── Google Calendar routes ──────────────────────────────────────────────────

    if (url.pathname === '/google/authorize') {
      if (!env.GOOGLE_CLIENT_ID) {
        return new Response('GOOGLE_CLIENT_ID secret not set on Worker', { status: 503 });
      }
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', googleRedirectUri(request));
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', GOOGLE_SCOPE);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      return new Response(null, { status: 302, headers: { Location: authUrl.toString() } });
    }

    if (url.pathname === '/google/callback') {
      const code = url.searchParams.get('code');
      const appUrl = allowed !== '*' ? allowed : '/';
      if (!code) {
        return new Response(null, { status: 302, headers: { Location: `${appUrl}?googleCalendar=error` } });
      }
      try {
        if (!env.HONEY_SYNC) throw new Error('HONEY_SYNC KV namespace not bound');
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: googleRedirectUri(request),
            grant_type: 'authorization_code',
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.refresh_token) {
          // Google only issues a refresh_token on the FIRST consent for a given account;
          // if the user had already granted access before without revoking it, prompt=consent
          // above should still force a fresh one — but surface a clear error if not.
          throw new Error(data.error_description || data.error || 'No refresh token returned');
        }
        await env.HONEY_SYNC.put('google-refresh-token', data.refresh_token);
        return new Response(null, { status: 302, headers: { Location: `${appUrl}?googleCalendar=connected` } });
      } catch (err) {
        return new Response(null, { status: 302, headers: { Location: `${appUrl}?googleCalendar=error` } });
      }
    }

    if (url.pathname === '/google/status') {
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      }
      const connected = !!(env.HONEY_SYNC && await env.HONEY_SYNC.get('google-refresh-token'));
      return new Response(JSON.stringify({ ok: connected }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (url.pathname === '/google/disconnect') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      }
      if (env.HONEY_SYNC) await env.HONEY_SYNC.delete('google-refresh-token');
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (url.pathname === '/google/calendar/events') {
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      }
      const timeMin = url.searchParams.get('timeMin');
      const timeMax = url.searchParams.get('timeMax');
      if (!timeMin || !timeMax) {
        return new Response(JSON.stringify({ error: 'timeMin and timeMax query params are required (ISO datetimes)' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      try {
        const accessToken = await getGoogleAccessToken(env);
        const eventsUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
        eventsUrl.searchParams.set('timeMin', timeMin);
        eventsUrl.searchParams.set('timeMax', timeMax);
        eventsUrl.searchParams.set('singleEvents', 'true');
        eventsUrl.searchParams.set('orderBy', 'startTime');
        const res = await fetch(eventsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Calendar API returned ${res.status}: ${text.slice(0, 200)}`);
        }
        const data = await res.json();
        const events = (data.items || [])
          .filter(ev => ev.status !== 'cancelled' && ev.start)
          .map(ev => ({
            id: ev.id,
            title: ev.summary || 'Untitled event',
            startISO: ev.start.dateTime || ev.start.date,
            endISO: ev.end?.dateTime || ev.end?.date,
            allDay: !ev.start.dateTime,
          }));
        return new Response(JSON.stringify({ events }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // ── Monzo card payments routes ──────────────────────────────────────────

    if (url.pathname === '/monzo/status') {
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      }
      if (!env.MONZO_API_KEY) {
        return new Response(JSON.stringify({ ok: false, error: 'MONZO_API_KEY secret not set on Worker' }), {
          status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      return new Response(JSON.stringify({ ok: true, accountLabel: 'Monzo Business' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (url.pathname === '/monzo/webhook') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      }
      if (!env.HONEY_SYNC) {
        return new Response(JSON.stringify({ error: 'HONEY_SYNC KV namespace not bound' }), {
          status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      try {
        if (!body.data || !body.data.id) {
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
        const txn = body.data;
        const transaction = {
          txnId: txn.id,
          amount: Math.abs(txn.amount || 0) / 100,
          date: (txn.created || new Date().toISOString()).slice(0, 10),
          reference: txn.description || (txn.merchant?.name || 'Monzo payment'),
          source: 'monzo',
          recordedAt: Date.now(),
        };
        const income = await env.HONEY_SYNC.get('monzo-card-income') || JSON.stringify([]);
        const list = JSON.parse(income);
        if (!list.some(t => t.txnId === txn.id)) {
          list.push(transaction);
          await env.HONEY_SYNC.put('monzo-card-income', JSON.stringify(list));
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    if (url.pathname === '/monzo/transactions') {
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      }
      if (!env.HONEY_SYNC) {
        return new Response(JSON.stringify({ error: 'HONEY_SYNC KV namespace not bound' }), {
          status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      if (!env.MONZO_API_KEY) {
        return new Response(JSON.stringify({ error: 'MONZO_API_KEY secret not set on Worker' }), {
          status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      try {
        const accountId = url.searchParams.get('account_id');
        if (!accountId) {
          return new Response(JSON.stringify({ error: 'account_id query param is required' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        const monzoRes = await fetch(`https://api.monzo.com/transactions?account_id=${encodeURIComponent(accountId)}&limit=100`, {
          headers: {
            'Authorization': `Bearer ${env.MONZO_API_KEY}`,
            'Accept': 'application/json',
          },
        });
        if (!monzoRes.ok) {
          const text = await monzoRes.text().catch(() => '');
          throw new Error(`Monzo API returned ${monzoRes.status}: ${text.slice(0, 200)}`);
        }
        const monzoData = await monzoRes.json();
        const newTxns = (monzoData.transactions || [])
          .filter(t => t.amount > 0 && t.settled)
          .map(t => ({
            txnId: t.id,
            amount: t.amount / 100,
            date: (t.created || new Date().toISOString()).slice(0, 10),
            reference: t.description || (t.merchant?.name || 'Monzo payment'),
            source: 'monzo',
            recordedAt: Date.now(),
          }));
        const income = await env.HONEY_SYNC.get('monzo-card-income') || JSON.stringify([]);
        const list = JSON.parse(income);
        const txnIds = new Set(list.map(t => t.txnId));
        const added = newTxns.filter(t => !txnIds.has(t.txnId));
        if (added.length > 0) {
          await env.HONEY_SYNC.put('monzo-card-income', JSON.stringify([...list, ...added]));
        }
        return new Response(JSON.stringify({ transactions: added }), {
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
