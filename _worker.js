// ALFATECH MOBILES - Cloudflare Pages advanced-mode worker.
// Serves the static site, plus a small API for the owner portal (/owner).
// Needs (Cloudflare Pages > Settings):
//   - KV namespace binding named  STORE
//   - Secret / variable named      OWNER_PASSWORD
// Without them the shop still works with the built-in catalogue; only saving is disabled.

const JSONH = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: JSONH });
const enc = new TextEncoder();
const TOKEN_HOURS = 12;

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode('alfatech:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function makeToken(env) {
  const exp = Date.now() + TOKEN_HOURS * 3600e3;
  return exp + '.' + await hmac(env.OWNER_PASSWORD, String(exp));
}
async function authed(req, env) {
  if (!env.OWNER_PASSWORD) return false;
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [exp, sig] = t.split('.');
  if (!exp || !sig || +exp < Date.now()) return false;
  return safeEqual(sig, await hmac(env.OWNER_PASSWORD, exp));
}
function validCatalog(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.models)) return 'models list missing';
  for (const m of c.models) {
    if (!m || typeof m.id !== 'string' || !m.id || typeof m.name !== 'string') return 'every model needs an id and a name';
    if (!Array.isArray(m.variants)) return `model ${m.id} has no variants list`;
    for (const v of m.variants) if (!v || typeof v.id !== 'string' || !(+v.price >= 0)) return `bad variant in ${m.id}`;
  }
  return null;
}

async function api(req, env, url) {
  const p = url.pathname;
  const kv = env.STORE;

  if (p === '/api/status') return json({ kv: !!kv, password: !!env.OWNER_PASSWORD });

  if (p === '/api/catalog' && req.method === 'GET') {
    if (!kv) return json({ error: 'kv_not_bound' }, 404);
    const v = await kv.get('catalog');
    if (!v) return json({ error: 'no_saved_catalog' }, 404);
    return new Response(v, { headers: JSONH });
  }

  if (p === '/api/owner/login' && req.method === 'POST') {
    if (!env.OWNER_PASSWORD) return json({ error: 'OWNER_PASSWORD is not set in Cloudflare' }, 503);
    let body = {};
    try { body = await req.json(); } catch (e) {}
    const ok = safeEqual(String(body.password || ''), String(env.OWNER_PASSWORD));
    if (!ok) { await new Promise(r => setTimeout(r, 700)); return json({ error: 'Wrong password' }, 401); }
    return json({ token: await makeToken(env), hours: TOKEN_HOURS });
  }

  if (p.startsWith('/api/owner/')) {
    if (!(await authed(req, env))) return json({ error: 'Please log in again' }, 401);
    if (!kv) return json({ error: 'KV binding STORE is not set in Cloudflare' }, 503);

    if (p === '/api/owner/catalog' && req.method === 'PUT') {
      const text = await req.text();
      if (text.length > 5e6) return json({ error: 'Catalogue too large' }, 413);
      let c;
      try { c = JSON.parse(text); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
      const bad = validCatalog(c);
      if (bad) return json({ error: bad }, 400);
      c.updated = new Date().toISOString().slice(0, 10);
      const prev = await kv.get('catalog');
      if (prev) await kv.put('catalog:prev', prev);
      await kv.put('catalog', JSON.stringify(c));
      return json({ ok: true, updated: c.updated });
    }
    if (p === '/api/owner/catalog' && req.method === 'DELETE') {
      const prev = await kv.get('catalog');
      if (prev) await kv.put('catalog:prev', prev);
      await kv.delete('catalog');
      return json({ ok: true });
    }
    if (p === '/api/owner/undo' && req.method === 'POST') {
      const prev = await kv.get('catalog:prev');
      if (!prev) return json({ error: 'Nothing to undo' }, 404);
      await kv.put('catalog', prev);
      return json({ ok: true });
    }
    if (p === '/api/owner/upload' && req.method === 'POST') {
      const type = (req.headers.get('content-type') || '').split(';')[0];
      if (!/^image\/(webp|jpeg|png)$/.test(type)) return json({ error: 'Only JPG, PNG or WebP images' }, 415);
      const buf = await req.arrayBuffer();
      if (buf.byteLength > 4 * 1024 * 1024) return json({ error: 'Image larger than 4 MB' }, 413);
      const id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
      await kv.put('media:' + id, buf, { metadata: { type } });
      return json({ url: '/media/' + id });
    }
  }
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p.startsWith('/api/')) return await api(req, env, url);
      if (p.startsWith('/media/')) {
        if (!env.STORE) return new Response('Not found', { status: 404 });
        const id = p.slice(7).replace(/[^a-f0-9]/g, '');
        const r = await env.STORE.getWithMetadata('media:' + id, { type: 'arrayBuffer' });
        if (!r || !r.value) return new Response('Not found', { status: 404 });
        return new Response(r.value, { headers: { 'content-type': (r.metadata && r.metadata.type) || 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' } });
      }
      // /owner is served by Pages itself from owner.html (pretty URLs).
    } catch (e) {
      return json({ error: 'Server error: ' + (e && e.message) }, 500);
    }
    return env.ASSETS.fetch(req);
  }
};
