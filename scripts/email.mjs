/**
 * email.mjs — gửi email qua SMTP (Lark Mail) + chèn tracking (pixel mở, redirect click, link huỷ nhận).
 *
 * Tracking KHÔNG cần server riêng: mọi lượt mở/click/huỷ đi qua Cloudflare Worker
 * (CFG.tracker.baseUrl) rồi Worker ghi thẳng vào Lark bảng 12.5 / 12.9 / 12.6.
 */
import nodemailer from "nodemailer";
import { encodeToken, normEmail, sleep } from "./lib.mjs";

/** Tạo transport SMTP dùng lại cho cả phiên gửi. */
export function makeTransport(CFG) {
  return nodemailer.createTransport({
    host: CFG.smtp.host,
    port: CFG.smtp.port,
    secure: CFG.smtp.secure,          // 465 = SSL trực tiếp
    auth: { user: CFG.smtp.user, pass: CFG.smtp.pass },
    pool: true,                        // tái dùng kết nối cho gửi hàng loạt
    maxConnections: 1,
    maxMessages: 100,
  });
}

/**
 * Thay biến trong template. ĐỠ CẢ HAI KIỂU NGOẶC:
 *   {{name}}          — kiểu cũ, dùng trong nội dung soạn trước đây
 *   {customer_name}   — kiểu mẫu thư Mentor, gõ thẳng trong Lark
 * Trước đây chỉ nhận ngoặc kép, nên thư soạn bằng ngoặc đơn đi ra NGUYÊN CHỮ
 * "{customer_name} thân mến" tới hộp thư khách.
 */
export function renderTemplate(tpl, vars = {}) {
  return String(tpl || "")
    // Ngoặc kép: khoá lạ thì xoá (giữ đúng hành vi cũ, thư cũ không đổi kết quả).
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) =>
      (vars[k] != null ? String(vars[k]) : ""))
    // Ngoặc đơn: CHỈ thay khi biết khoá, khoá lạ giữ nguyên. Cố ý làm vậy để không
    // đụng vào CSS trong thư HTML (kiểu "a{color:red}") và không âm thầm nuốt chữ.
    .replace(/\{\s*([a-zA-Z0-9_]+)\s*\}/g, (nguyenVan, k) =>
      (vars[k] != null ? String(vars[k]) : nguyenVan));
}

const b64url = (s) => Buffer.from(String(s), "utf8").toString("base64url");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * Chèn tracking vào HTML cho MỘT người nhận.
 * - Mọi link http(s) → đi qua {base}/c?t=..&u=.. (Worker ghi 12.9 rồi 302 sang link gốc).
 * - Chèn pixel 1x1 {base}/o?t=.. cuối body (Worker ghi 12.5 khi ảnh được tải = email được mở).
 * - Thêm footer huỷ nhận {base}/u?t=.. (Worker ghi 12.6).
 */
export function injectTracking(html, { base, token, unsubUrl, showFooter = true }) {
  let out = String(html || "");
  if (base) {
    // 1) rewrite link click (bỏ qua mailto/tel/anchor và chính link huỷ nhận)
    out = out.replace(/href\s*=\s*"(https?:\/\/[^"]+)"/gi, (m, url) => {
      if (unsubUrl && url === unsubUrl) return m;
      const wrapped = `${base}/c?t=${token}&u=${b64url(url)}`;
      return `href="${esc(wrapped)}"`;
    });
    // 2) pixel mở
    const pixel = `<img src="${base}/o?t=${token}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px" />`;
    out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, pixel + "</body>") : out + pixel;
  }
  // 3) footer huỷ nhận (bắt buộc với email marketing)
  if (showFooter && unsubUrl) {
    const footer = `
<div style="margin-top:28px;padding-top:14px;border-top:1px solid #eee;font-size:12px;color:#888;font-family:Arial,Helvetica,sans-serif">
  Bạn nhận email này vì đã đăng ký nhận thông tin từ chúng tôi.
  <a href="${esc(unsubUrl)}" style="color:#888;text-decoration:underline">Huỷ nhận email</a>.
</div>`;
    out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, footer + "</body>") : out + footer;
  }
  return out;
}

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Markdown inline nhẹ: **đậm**, _nghiêng_, [chữ](link). Áp dụng SAU khi đã escape. */
function inlineMd(s) {
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u.replace(/"/g, "%22")}">${t}</a>`);
  // URL DÁN TRẦN cũng thành liên kết. Trước đây không có bước này nên link viết trần ra thư
  // dưới dạng CHỮ CHẾT: người đọc phải copy dán tay, và click không bao giờ đo được (bảng 12.9
  // luôn trống). Điều kiện "đứng sau khoảng trắng hoặc (" khiến nó KHÔNG đụng vào URL vừa nằm
  // trong href="..." hay trong chữ hiển thị của thẻ <a> ở dòng trên.
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, u) => `${pre}<a href="${u.replace(/"/g, "%22")}">${u}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<i>$2</i>");
  return s;
}

/**
 * Dựng BẢN CHỮ THUẦN để gửi kèm HTML (multipart/alternative).
 * Thư chỉ có HTML là dấu hiệu thư máy — mọi thang chấm spam đều trừ điểm. Thư người thật
 * gần như luôn có cả hai phần.
 */
export function toPlainText(body) {
  const s = String(body || "");
  if (/<(p|div|h[1-6]|ul|ol|br|table|img|a)\b/i.test(s)) {      // nội dung đã là HTML → bóc thẻ
    return s.replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
      .replace(/\n{3,}/g, "\n\n").trim();
  }
  return s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2")   // link → "chữ: url"
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1$2")
    .trim();
}
/**
 * Chuyển VĂN BẢN THUẦN → HTML (để người soạn không phải gõ thẻ trong bảng 12.2/12.4):
 * - Dòng trống ngăn cách = đoạn <p>; xuống dòng đơn = <br>.
 * - Dòng bắt đầu "- " / "* " = danh sách; "1. " = danh sách số.
 * - **đậm**, _nghiêng_, [chữ](https://link). Link http(s) vẫn được gắn tracking.
 * - Nếu nội dung ĐÃ chứa thẻ khối HTML (p/div/h/ul/br/a…) thì giữ nguyên (tương thích ngược).
 */
export function textToHtml(body) {
  const raw = String(body || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  if (/<(p|div|h[1-6]|ul|ol|br|table|img|a)\b/i.test(raw)) return raw;
  const li = (l, re) => `<li>${inlineMd(escapeHtml(l.replace(re, "")))}</li>`;
  const out = [];
  for (const block of raw.split(/\n{2,}/)) {
    const lines = block.split("\n");
    let i = 0;
    while (i < lines.length) {
      if (/^\s*[-*]\s+/.test(lines[i])) {                          // danh sách chấm
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(li(lines[i++], /^\s*[-*]\s+/));
        out.push("<ul>" + items.join("") + "</ul>");
      } else if (/^\s*\d+[.)]\s+/.test(lines[i])) {                // danh sách số
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(li(lines[i++], /^\s*\d+[.)]\s+/));
        out.push("<ol>" + items.join("") + "</ol>");
      } else {                                                     // đoạn văn
        const para = [];
        while (i < lines.length && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i])) para.push(inlineMd(escapeHtml(lines[i++])));
        out.push("<p>" + para.join("<br>") + "</p>");
      }
    }
  }
  return out.join("\n");
}

/** Bọc nội dung thành khung HTML gửi được (tự chuyển văn bản thuần → HTML). */
export function ensureHtmlDoc(body) {
  const s = String(body || "");
  if (/<html[\s>]/i.test(s)) return s;
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222">${textToHtml(s)}</body></html>`;
}

/**
 * Chuẩn bị + gửi 1 email tới 1 người nhận.
 * @returns {ok, messageId?, error?, skipped?}
 */
export async function sendOne(transport, CFG, { to, name, subject, html, campaign, step, link, files }) {
  const email = normEmail(to);
  const token = encodeToken({ e: email, c: campaign, s: step });
  const base = CFG.tracker.baseUrl;
  const unsubUrl = base ? `${base}/u?t=${token}` : undefined;

  // Cùng một giá trị khai nhiều tên gọi: bản mẫu của Mentor dùng {customer_name},
  // nội dung viết trước đó dùng {{name}}. Đỡ cả hai để không phải sửa lại thư cũ.
  const ten = name || "bạn";
  const vars = {
    name: ten, customer_name: ten, ten_khach: ten,
    email, customer_email: email,
    unsubscribe_url: unsubUrl || "",
  };
  let than = String(html || "");
  if (link) than += `\n\n[Xem chi tiết](${link})`;            // cột Link của bảng → nút xem thêm cuối thư
  const rendered = renderTemplate(than, vars);
  const subj = renderTemplate(subject, vars);                                     // cá nhân hóa cả tiêu đề
  let doc = ensureHtmlDoc(rendered);
  doc = injectTracking(doc, { base, token, unsubUrl });

  // Bản chữ thuần đi kèm. Chân thư chỉ thêm khi có link huỷ nhận, để khớp đúng với bản HTML
  // (injectTracking cũng chỉ chèn chân thư khi có unsubUrl).
  let text = toPlainText(rendered);
  if (unsubUrl) text += `\n\n---\nBạn nhận email này vì đã đăng ký nhận thông tin từ chúng tôi.\nHuỷ nhận: ${unsubUrl}`;

  const from = `"${CFG.smtp.fromName}" <${CFG.smtp.fromEmail}>`;
  // List-Unsubscribe LUÔN có. Trước đây chỉ gắn khi bật tracking — mà bản chạy thật không có
  // tracker nên thư đi ra KHÔNG mang header nào, các nhà mạng mất một tín hiệu tin cậy quan trọng.
  const unsubMailto = `<mailto:${CFG.smtp.fromEmail}?subject=ngung-nhan>`;
  const headers = { "List-Unsubscribe": unsubUrl ? `<${unsubUrl}>, ${unsubMailto}` : unsubMailto };
  if (unsubUrl) headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";  // One-Click cần URL

  if (CFG.send.dryRun) {
    return { ok: true, skipped: true, messageId: "(dry-run)" };
  }
  const thu = { from, to: email, subject: subj, text, html: doc, headers };
  if (files && files.length) thu.attachments = files;          // cột File của bảng → tệp đính kèm

  try {
    const info = await transport.sendMail(thu);
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Tải tệp đính kèm từ một ô attachment của Lark về dạng nodemailer gửi được.
 * Lark trả link tải tạm dùng được không cần đăng nhập — nhưng chỉ sống ít phút,
 * nên phải tải ngay tại đây chứ đừng đưa link đó vào thư.
 */
export async function taiDinhKem(CFG, oFile, larkToken) {
  const ds = Array.isArray(oFile) ? oFile : [];
  if (!ds.length) return [];
  const ra = [];
  for (const f of ds) {
    if (!f?.url && !f?.file_token) continue;
    try {
      const r = await fetch(f.url || `${CFG.larkDomain}/open-apis/drive/v1/medias/${f.file_token}/download`, {
        headers: { Authorization: `Bearer ${larkToken}` },
      });
      if (!r.ok) { console.log(`  ⚠️  không tải được tệp "${f.name}" (HTTP ${r.status}) — bỏ qua`); continue; }
      ra.push({ filename: f.name || "tep-dinh-kem", content: Buffer.from(await r.arrayBuffer()) });
    } catch (e) {
      console.log(`  ⚠️  lỗi tải tệp "${f.name}": ${e.message} — bỏ qua`);
    }
  }
  return ra;
}

/** Lark từ chối vì bộ lọc rác (mã 912) — KHÔNG phải địa chỉ hỏng. Đừng bao giờ coi là hard bounce. */
export const isAntispamReject = (msg) => /\b912\b|antispam|suspected to be spam/i.test(String(msg || ""));

/** Gửi lần lượt 1 danh sách người nhận với throttle (nghỉ delayMs giữa 2 email). */
export async function sendBatch(transport, CFG, recipients, buildMsg, onResult) {
  let sent = 0, failed = 0, skipped = 0;
  const limit = CFG.send.perRunLimit || recipients.length;
  for (let i = 0; i < recipients.length && sent + failed < limit; i++) {
    const r = recipients[i];
    const msg = buildMsg(r);
    const res = await sendOne(transport, CFG, msg);
    if (res.ok && !res.skipped) sent++;
    else if (res.skipped) skipped++;
    else failed++;
    if (onResult) await onResult(r, res);
    if (i < recipients.length - 1 && CFG.send.delayMs) await sleep(CFG.send.delayMs);
  }
  return { sent, failed, skipped };
}
