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

// Lỗi DNS "kết luận được": domain thật sự không tồn tại / không có bản ghi.
// Mọi mã khác (ECONNREFUSED, ETIMEOUT, ESERVFAIL, EREFUSED…) là HẠ TẦNG HỎNG — ta KHÔNG biết gì
// về domain đó, và tuyệt đối không được suy ra "mail ảo".
const DNS_KET_LUAN = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

const mxCache = new Map();
/** @returns {Promise<true|false|null>}  true=có nhận mail · false=chắc chắn không · null=KHÔNG TRA ĐƯỢC */
async function hasMxRecord(domain) {
  if (mxCache.has(domain)) return mxCache.get(domain);

  const thu = async (fn) => {
    try { const r = await fn(); return { ok: Array.isArray(r) && r.length > 0 }; }
    catch (e) { return { err: e.code || e.message }; }
  };

  let kq = null;
  const mx = await thu(() => dns.resolveMx(domain));
  if (mx.ok) kq = true;
  else {
    // Không có MX → thử A record (một số domain nhận mail qua A).
    const a = await thu(() => dns.resolve(domain));
    if (a.ok) kq = true;
    else {
      // Chỉ dám kết luận "không có" khi CẢ HAI truy vấn đều trả lời dứt khoát.
      const dutKhoat = (x) => x.err === undefined || DNS_KET_LUAN.has(x.err);
      kq = dutKhoat(mx) && dutKhoat(a) ? false : null;
    }
  }

  mxCache.set(domain, kq);
  return kq;
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
    const mx = await hasMxRecord(domain);
    out.hasMx = mx === true;
    // mx === null → tra DNS hỏng. KHÔNG chấm "Không hợp lệ", vì 12.7 "Không hợp lệ" sẽ đi thẳng
    // vào danh sách chặn gửi (suppression.mjs) và chặn người thật VĨNH VIỄN. Để "Nghi ngờ" —
    // không chặn ai, và lần chạy sau (DNS khoẻ lại) sẽ tự kết luận đúng.
    if (mx === null) { out.result = "Nghi ngờ"; out.reason = "Không tra được DNS — chưa kết luận, chạy lại sau"; return out; }
    if (mx === false) { out.result = "Không hợp lệ"; out.reason = "Domain không có bản ghi MX"; return out; }
  } else {
    out.hasMx = true;
  }

  if (ROLE.has(local)) { out.result = "Nghi ngờ"; out.reason = "Hộp thư vai trò (role-based)"; return out; }

  out.result = "Hợp lệ";
  out.reason = "";
  return out;
}
