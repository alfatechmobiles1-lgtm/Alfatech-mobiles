// ALFATECH MOBILES - Cloudflare Worker (static assets + owner-portal API).
// Static files are served from ./public by the ASSETS binding (see wrangler.jsonc).
// Needs: KV binding STORE (in wrangler.jsonc) and secret OWNER_PASSWORD
// (Worker > Settings > Variables and Secrets). Without them the shop still works.
// Order and sign-up alerts: WhatsApp via CALLMEBOT_PHONE + CALLMEBOT_APIKEY, and/or Telegram via TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
// (comma-separate several recipients).

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


/* ---------- order and signup alerts (Telegram) ---------- */
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const rupees = n => '₹' + (+n || 0).toLocaleString('en-IN');
const okPhone = v => /^[6-9][0-9]{9}$/.test(String(v || ''));
async function alertShop(env, text) {
  let sent = false, any = false;
  // 1) WhatsApp through CallMeBot: CALLMEBOT_PHONE and CALLMEBOT_APIKEY (comma-separated lists, same order)
  const wp = String(env.CALLMEBOT_PHONE || '').split(',').map(x => x.trim()).filter(Boolean), wk = String(env.CALLMEBOT_APIKEY || '').split(',').map(x => x.trim());
  for (let i = 0; i < wp.length; i++) {
    if (!wk[i]) continue; any = true;
    try {
      const r = await fetch(`https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(wp[i])}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(wk[i])}`);
      if (r.ok) sent = true;
    } catch (e) {}
  }
  // 2) Telegram: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
  const token = env.TELEGRAM_BOT_TOKEN, ids = String(env.TELEGRAM_CHAT_ID || '').split(',').map(x => x.trim()).filter(Boolean);
  if (token) for (const id of ids) {
    any = true;
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: id, text, disable_web_page_preview: true }) });
      if (r.ok) sent = true;
    } catch (e) {}
  }
  return { sent, reason: sent ? '' : any ? 'send_failed' : 'alerts_not_set' };
}
async function readBody(req) {
  const t = await req.text();
  if (t.length > 30000) throw new Error('too_large');
  const b = JSON.parse(t);
  if (!b || typeof b !== 'object' || b.website) throw new Error('bad');   // "website" is a hidden trap field for bots
  return b;
}
async function shopEvents(req, env, p) {
  let b;
  try { b = await readBody(req); } catch (e) { return json({ error: 'Bad request' }, 400); }
  const c = b.customer || {};
  const cname = clip(c.name, 80), cphone = clip(c.phone, 10);
  if (cname.length < 2 || !okPhone(cphone)) return json({ error: 'Name and a 10-digit mobile are needed' }, 400);
  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  if (p === '/api/signup') {
    if (env.STORE) await env.STORE.put('cust:' + cphone, JSON.stringify({ name: cname, phone: cphone, at: new Date().toISOString() }));
    const r = await alertShop(env, `NEW SIGN-UP\n${cname}\n${cphone}\n${when}`);
    return json({ ok: true, notified: r.sent });
  }

  const ref = clip(b.ref, 20).replace(/[^A-Za-z0-9]/g, '');
  if (!ref) return json({ error: 'Order reference missing' }, 400);

  if (p === '/api/paid') {
    const r = await alertShop(env, `PAYMENT CLAIMED  ${ref}\n${cname}, ${cphone}\nAmount: ${rupees(b.total)}\nThe customer says the UPI payment is done and is sending the screenshot on WhatsApp. Check your bank before handing over the phone.\n${when}`);
    return json({ ok: true, notified: r.sent });
  }

  // /api/order
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 10).map((i, k) =>
    `${k + 1}. ${clip(i.name, 80)}${i.variant ? ' (' + clip(i.variant, 40) + ')' : ''}${i.colour ? ', ' + clip(i.colour, 30) : ''} x ${Math.max(1, Math.min(9, +i.qty || 1))}: ${rupees(i.price)}`);
  if (!items.length) return json({ error: 'No items' }, 400);
  const d = b.delivery || {};
  const pay = clip(b.payment, 40);
  const note = /UPI/i.test(pay) ? 'Waiting for UPI payment. You get a second alert if the customer says it is paid.' : /EMI/i.test(pay) ? 'EMI: call or WhatsApp the customer.' : 'Cash on delivery: Shahjahanpur only.';
  const text = `NEW ORDER  ${ref}\n${when}\n\n${items.join('\n')}\nTotal: ${rupees(b.total)}\nPayment: ${pay}\n${note}\n\nCustomer: ${cname}, ${cphone}\nDeliver to: ${clip(d.name, 80)}, ${clip(d.phone, 10)}\n${clip(d.line1, 160)}${d.line2 ? ', ' + clip(d.line2, 80) : ''}, ${clip(d.city, 60)}${d.district ? ', ' + clip(d.district, 60) : ''} - ${clip(d.pincode, 6)}` + (b.note ? `\nNote: ${clip(b.note, 300)}` : '');
  if (env.STORE) await env.STORE.put('order:' + ref, JSON.stringify({ at: new Date().toISOString(), text }), { expirationTtl: 60 * 86400 });
  const r = await alertShop(env, text);
  return json({ ok: true, notified: r.sent });
}

async function api(req, env, url) {
  const p = url.pathname;
  const kv = env.STORE;

  if (p === '/api/status') return json({ kv: !!kv, password: !!env.OWNER_PASSWORD, whatsapp: !!(env.CALLMEBOT_PHONE && env.CALLMEBOT_APIKEY), telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) });
  if (req.method === 'POST' && (p === '/api/signup' || p === '/api/order' || p === '/api/paid')) return shopEvents(req, env, p);

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
