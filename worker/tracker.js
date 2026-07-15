/**
 * tracker.js — Cloudflare Worker: endpoint tracking cho hệ Email Marketing.
 *   GET /o?t=<token>              → trả pixel 1x1, ghi "mở" vào 12.5 Báo cáo đọc Email
 *   GET /c?t=<token>&u=<b64url>   → ghi "click" vào 12.9, rồi 302 sang link gốc
 *   GET|POST /u?t=<token>         → ghi "huỷ nhận" vào 12.6, trả trang xác nhận
 *
 * token = base64url(JSON {e:email, c:campaign, s:step}) do email.mjs tạo.
 * Worker ghi thẳng vào Lark Base bằng tenant_access_token (không cần server riêng).
 *
 * Biến cần đặt (wrangler.toml [vars] + secret):
 *   LARK_DOMAIN, LARK_APP_ID, LARK_APP_TOKEN, TABLE_OPEN, TABLE_CLICK, TABLE_UNSUB   (vars)
 *   LARK_APP_SECRET   (secret:  wrangler secret put LARK_APP_SECRET)
 *
 * Nếu bạn ĐỔI TÊN CỘT trên Lark, sửa khối FIELDS bên dưới cho khớp.
 */

const FIELDS = {
  open:  { email: "Email", campaign: "Chiến dịch", step: "Bước", first: "Mở lần đầu",  last: "Mở gần nhất",  count: "Số lần mở",  ua: "Thiết bị" },
  click: { email: "Email", campaign: "Chiến dịch", step: "Bước", url: "Link đích", first: "Nhấp lần đầu", last: "Nhấp gần nhất", count: "Số lần nhấp" },
  unsub: { email: "Email", when: "Thời gian huỷ", source: "Nguồn", campaign: "Chiến dịch" },
};

const GIF_1x1 = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

function b64urlToStr(s) {
  s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function decodeToken(t) { try { return JSON.parse(b64urlToStr(t)); } catch { return null; } }

// ---- Lark ----
let TOKEN = null, TOKEN_EXP = 0;
async function larkToken(env) {
  if (TOKEN && Date.now() < TOKEN_EXP) return TOKEN;
  const r = await fetch(`${env.LARK_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: env.LARK_APP_ID, app_secret: env.LARK_APP_SECRET }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`token ${j.code} ${j.msg}`);
  TOKEN = j.tenant_access_token; TOKEN_EXP = Date.now() + (j.expire - 120) * 1000;
  return TOKEN;
}
async function larkApi(env, method, path, body) {
  const token = await larkToken(env);
  const r = await fetch(`${env.LARK_DOMAIN}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}
async function findOne(env, table, conditions) {
  const j = await larkApi(env, "POST",
    `/open-apis/bitable/v1/apps/${env.LARK_APP_TOKEN}/tables/${table}/records/search?page_size=1`,
    { filter: { conjunction: "and", conditions } });
  return j?.data?.items?.[0] || null;
}
const createRec = (env, table, fields) =>
  larkApi(env, "POST", `/open-apis/bitable/v1/apps/${env.LARK_APP_TOKEN}/tables/${table}/records`, { fields });
const updateRec = (env, table, id, fields) =>
  larkApi(env, "PUT", `/open-apis/bitable/v1/apps/${env.LARK_APP_TOKEN}/tables/${table}/records/${id}`, { fields });

const cond = (field, value) => ({ field_name: field, operator: "is", value: [String(value)] });

async function recordOpen(env, tok, ua) {
  const F = FIELDS.open, now = Date.now();
  const existing = await findOne(env, env.TABLE_OPEN, [cond(F.email, tok.e), cond(F.campaign, tok.c), cond(F.step, tok.s)]);
  if (existing) {
    const prev = Number(existing.fields?.[F.count] || 0);
    await updateRec(env, env.TABLE_OPEN, existing.record_id, { [F.count]: prev + 1, [F.last]: now });
  } else {
    await createRec(env, env.TABLE_OPEN, {
      [F.email]: tok.e, [F.campaign]: tok.c, [F.step]: tok.s,
      [F.first]: now, [F.last]: now, [F.count]: 1, [F.ua]: (ua || "").slice(0, 200),
    });
  }
}
async function recordClick(env, tok, url) {
  const F = FIELDS.click, now = Date.now();
  const existing = await findOne(env, env.TABLE_CLICK, [cond(F.email, tok.e), cond(F.campaign, tok.c), cond(F.step, tok.s), cond(F.url, url)]);
  if (existing) {
    const prev = Number(existing.fields?.[F.count] || 0);
    await updateRec(env, env.TABLE_CLICK, existing.record_id, { [F.count]: prev + 1, [F.last]: now });
  } else {
    await createRec(env, env.TABLE_CLICK, {
      [F.email]: tok.e, [F.campaign]: tok.c, [F.step]: tok.s,
      [F.url]: { link: url, text: url }, [F.first]: now, [F.last]: now, [F.count]: 1,
    });
  }
}
async function recordUnsub(env, tok, source) {
  const F = FIELDS.unsub;
  const existing = await findOne(env, env.TABLE_UNSUB, [cond(F.email, tok.e)]);
  if (!existing) {
    await createRec(env, env.TABLE_UNSUB, { [F.email]: tok.e, [F.when]: Date.now(), [F.source]: source, [F.campaign]: tok.c });
  }
}

const pixel = () => new Response(GIF_1x1, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0", "Content-Length": String(GIF_1x1.length) } });
const html = (body) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;color:#222;text-align:center">${body}</body>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, "") || "/";
    const tok = decodeToken(url.searchParams.get("t"));

    // /o — pixel mở (luôn trả pixel, ghi log ở background)
    if (p === "/o") {
      if (tok?.e) ctx.waitUntil(recordOpen(env, tok, request.headers.get("user-agent")).catch(() => {}));
      return pixel();
    }

    // /c — click → redirect
    if (p === "/c") {
      let dest = "/";
      try { dest = b64urlToStr(url.searchParams.get("u")); } catch {}
      if (!/^https?:\/\//i.test(dest)) dest = "https://" + dest.replace(/^\/+/, "");
      if (tok?.e) ctx.waitUntil(recordClick(env, tok, dest).catch(() => {}));
      return Response.redirect(dest, 302);
    }

    // /u — huỷ nhận (GET = người bấm link; POST = One-Click của mail client)
    if (p === "/u") {
      const source = request.method === "POST" ? "One-click" : "Link";
      if (tok?.e) ctx.waitUntil(recordUnsub(env, tok, source).catch(() => {}));
      if (request.method === "POST") return new Response("OK", { status: 200 });
      return html(`<h2>Đã huỷ nhận email ✅</h2><p>Email <b>${tok?.e || ""}</b> sẽ không nhận thư từ chúng tôi nữa.</p><p style="color:#888;font-size:13px">Nếu là nhầm lẫn, hãy liên hệ để đăng ký lại.</p>`);
    }

    if (p === "/" ) return new Response("mentor-club email tracker: OK", { status: 200 });
    return new Response("Not found", { status: 404 });
  },
};
