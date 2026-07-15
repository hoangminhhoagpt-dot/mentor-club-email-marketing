/**
 * validate.mjs — engine "Lọc mail ảo" (bảng 12.7), zero-dependency.
 * Kiểm tra: cú pháp → domain dùng 1 lần → bản ghi MX (domain có nhận mail không) → role-based.
 */
import dns from "node:dns/promises";
import { normEmail } from "./lib.mjs";

// Danh sách domain email "dùng 1 lần" phổ biến (mail ảo). Bổ sung tuỳ nhu cầu.
export const DISPOSABLE = new Set([
  "mailinator.com", "10minutemail.com", "guerrillamail.com", "guerrillamail.info",
  "sharklasers.com", "grr.la", "guerrillamailblock.com", "tempmail.com", "temp-mail.org",
  "tempmailo.com", "throwawaymail.com", "yopmail.com", "yopmail.fr", "getnada.com",
  "trashmail.com", "trashmail.net", "maildrop.cc", "dispostable.com", "fakeinbox.com",
  "mailnesia.com", "mytemp.email", "mohmal.com", "emailondeck.com", "moakt.com",
  "spamgourmet.com", "mailcatch.com", "tempinbox.com", "burnermail.io", "33mail.com",
  "getairmail.com", "inboxbear.com", "tempr.email", "luxusmail.org", "mail-temp.com",
  "1secmail.com", "1secmail.org", "1secmail.net", "vjuum.com", "laafd.com",
]);

// Hộp thư "vai trò" (thường không phải người thật) → đánh dấu nghi ngờ.
const ROLE = new Set([
  "info", "admin", "administrator", "support", "sales", "contact", "help",
  "no-reply", "noreply", "postmaster", "webmaster", "hostmaster", "abuse",
  "billing", "office", "hr", "marketing", "team", "root",
]);

// RFC 5322 rút gọn — đủ dùng cho lọc thực tế.
const RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const mxCache = new Map();
async function hasMxRecord(domain) {
  if (mxCache.has(domain)) return mxCache.get(domain);
  let ok = false;
  try {
    const mx = await dns.resolveMx(domain);
    ok = Array.isArray(mx) && mx.length > 0;
  } catch {
    // Không có MX — thử A record (một số domain nhận mail qua A). Không có luôn = fail.
    try { const a = await dns.resolve(domain); ok = Array.isArray(a) && a.length > 0; }
    catch { ok = false; }
  }
  mxCache.set(domain, ok);
  return ok;
}

/**
 * @returns {{email, result, reason, hasMx, disposable}}
 * result ∈ "Hợp lệ" | "Không hợp lệ" | "Nghi ngờ"
 */
export async function validateEmail(raw, { checkMx = true } = {}) {
  const email = normEmail(raw);
  const out = { email, result: "Không hợp lệ", reason: "", hasMx: false, disposable: false };

  if (!email || !RE.test(email)) { out.reason = "Sai cú pháp email"; return out; }

  const [local, domain] = email.split("@");
  if (DISPOSABLE.has(domain)) { out.disposable = true; out.result = "Không hợp lệ"; out.reason = "Domain dùng 1 lần (mail ảo)"; return out; }

  if (checkMx) {
    out.hasMx = await hasMxRecord(domain);
    if (!out.hasMx) { out.result = "Không hợp lệ"; out.reason = "Domain không có bản ghi MX"; return out; }
  } else {
    out.hasMx = true;
  }

  if (ROLE.has(local)) { out.result = "Nghi ngờ"; out.reason = "Hộp thư vai trò (role-based)"; return out; }

  out.result = "Hợp lệ";
  out.reason = "";
  return out;
}
