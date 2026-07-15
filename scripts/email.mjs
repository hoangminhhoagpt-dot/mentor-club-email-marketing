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

/** Thay {{name}}, {{email}}, {{unsubscribe_url}}... trong template. */
export function renderTemplate(tpl, vars = {}) {
  return String(tpl || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) =>
    (vars[k] != null ? String(vars[k]) : ""));
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
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<i>$2</i>");
  return s;
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
export async function sendOne(transport, CFG, { to, name, subject, html, campaign, step }) {
  const email = normEmail(to);
  const token = encodeToken({ e: email, c: campaign, s: step });
  const base = CFG.tracker.baseUrl;
  const unsubUrl = base ? `${base}/u?t=${token}` : undefined;

  const vars = { name: name || "bạn", email, unsubscribe_url: unsubUrl || "" };   // fallback tên = "bạn"
  const rendered = renderTemplate(html, vars);
  const subj = renderTemplate(subject, vars);                                     // cá nhân hóa cả tiêu đề
  let doc = ensureHtmlDoc(rendered);
  doc = injectTracking(doc, { base, token, unsubUrl });

  const from = `"${CFG.smtp.fromName}" <${CFG.smtp.fromEmail}>`;
  const headers = {};
  if (unsubUrl) {
    headers["List-Unsubscribe"] = `<${unsubUrl}>, <mailto:${CFG.smtp.fromEmail}?subject=unsubscribe>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  if (CFG.send.dryRun) {
    return { ok: true, skipped: true, messageId: "(dry-run)" };
  }
  try {
    const info = await transport.sendMail({ from, to: email, subject: subj, html: doc, headers });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

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
