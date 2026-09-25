// ميزان الاستغفار — Worker صغير قدام Supabase
// بيحفظ إحصائيات الموقع العامة ١٠ ثواني، فلو آلاف الناس فتحوا الموقع في نفس اللحظة
// Supabase بيشوف طلب واحد بس كل ١٠ ثواني بدل آلاف الطلبات.
// أي مسار تاني (الصفحة والصور) بيتقدّم من ملفات public مباشرة.

const TTL_MS = 10000;
let cached = { t: 0, body: null };
let inflight = null;

function json(body, extra = {}) {
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=10',
      ...extra,
    },
  });
}

async function refresh(env) {
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/site_stats', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) throw new Error('upstream ' + r.status);
  const body = await r.text();
  cached = { t: Date.now(), body };
  return body;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/stats') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      if (cached.body && Date.now() - cached.t < TTL_MS) return json(cached.body, { 'x-cache': 'hit' });
      try {
        // لو فيه طلب شغال بالفعل، الكل يستنى نفس النتيجة بدل ما كل واحد يبعت طلب
        inflight = inflight || refresh(env).finally(() => { inflight = null; });
        return json(await inflight, { 'x-cache': 'miss' });
      } catch (e) {
        if (cached.body) return json(cached.body, { 'x-cache': 'stale' });
        return new Response('{"error":"unavailable"}', { status: 502, headers: { 'content-type': 'application/json' } });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
