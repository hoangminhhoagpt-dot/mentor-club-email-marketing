/**
 * sync-bounces.mjs — bảng 12.8 "Danh sách mail lỗi".
 * Đọc hộp thư Lark Mail qua IMAP, tìm thư báo lỗi gửi (bounce / DSN từ mailer-daemon) trong
 * N ngày gần nhất, bóc email người nhận bị lỗi + mã trạng thái, rồi UPSERT vào 12.8.
 * (Bounce là cách DUY NHẤT lấy lỗi gửi khi dùng SMTP thuần — không có webhook như ESP.)
 *
 * Chạy: node scripts/sync-bounces.mjs            (mặc định 3 ngày)
 *       DAYS=7 node scripts/sync-bounces.mjs
 */
import { ImapFlow } from "imapflow";
import {
  loadConfig, requireKeys, listAllRecords, createRecord, updateRecord, F, normEmail, nowMs,
} from "./lib.mjs";
import { getText } from "./suppression.mjs";

const CFG = loadConfig();
const DAYS = Number(process.env.DAYS || 3);
const DAY_MS = 86400000;

function parseBounce(src) {
  const s = src.replace(/=\r?\n/g, "");                    // gỡ soft-break quoted-printable
  // 1) DSN chuẩn (Gmail/Outlook/… phòng khi đổi nhà cung cấp)
  let m = s.match(/Final-Recipient:\s*rfc822;\s*<?([^\s<>;"]+@[^\s<>;"]+)>?/i)
       || s.match(/Original-Recipient:\s*rfc822;\s*<?([^\s<>;"]+@[^\s<>;"]+)>?/i);
  // 2) Định dạng Lark Mail: dòng "Email delivery failed <email>"
  if (!m) m = s.match(/Email delivery failed[:\s]+<?([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})>?/i);
  if (!m) return null;
  const email = normEmail(m[1]);
  const status = (s.match(/Status:\s*([245]\.\d+\.\d+)/i) || [])[1] || "";
  const diag = (s.match(/Diagnostic-Code:\s*([^\r\n]+)/i) || [])[1]
            || (s.match(/Email delivery failed[^\r\n<]*/i) || [])[0] || "";
  // Lark chỉ dội thư lại sau khi đã bỏ cuộc → mặc định coi là Hard, chỉ hạ xuống Soft nếu thấy mã 4.x.x
  let type = "Hard bounce";
  if (/^4\./.test(status) || /\b45\d\b/.test(diag)) type = "Soft bounce";
  const detail = [status && `Status ${status}`, diag].filter(Boolean).join(" — ").slice(0, 500);
  return { email, type, detail: detail || "Bounce (Lark)" };
}

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret", "imap.user", "imap.pass", "tables.errorList"]);
  const T = CFG.tables.errorList;
  const eEmail = F(CFG, "errorList", "email");
  const eType = F(CFG, "errorList", "errorType");
  const eDetail = F(CFG, "errorList", "detail");
  const eWhen = F(CFG, "errorList", "occurredAt");

  // map email -> record_id để upsert
  const existing = await listAllRecords(CFG, T);
  const byEmail = new Map(existing.map((r) => [normEmail(getText(r.fields, eEmail)), r.record_id]));

  const client = new ImapFlow({
    host: CFG.imap.host, port: CFG.imap.port, secure: true,
    auth: { user: CFG.imap.user, pass: CFG.imap.pass }, logger: false,
  });
  await client.connect();
  const found = [];
  const lock = await client.getMailboxLock("INBOX");
  try {
    const since = new Date(Date.now() - DAYS * DAY_MS);
    let uids = [];
    try { uids = await client.search({ from: "mailer-daemon", since }, { uid: true }); } catch {}
    if (!uids || !uids.length) {
      try { uids = await client.search({ from: "postmaster", since }, { uid: true }); } catch {}
    }
    for (const uid of (uids || [])) {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!msg?.source) continue;
      const b = parseBounce(msg.source.toString("utf8"));
      if (b?.email) found.push(b);
    }
  } finally { lock.release(); }
  await client.logout();

  // dedupe trong lần chạy (giữ bản mới nhất)
  const uniq = new Map();
  for (const b of found) uniq.set(b.email, b);

  let created = 0, updated = 0;
  for (const b of uniq.values()) {
    const fields = { [eEmail]: b.email, [eType]: b.type, [eDetail]: b.detail, [eWhen]: nowMs() };
    if (byEmail.has(b.email)) { await updateRecord(CFG, T, byEmail.get(b.email), fields); updated++; }
    else { const rec = await createRecord(CFG, T, fields); byEmail.set(b.email, rec.record_id); created++; }
    console.log(`  ${b.type.padEnd(12)} ${b.email}`);
  }
  console.log(`\n✅ Đồng bộ bounce (${DAYS} ngày): mới ${created} · cập nhật ${updated} · tổng phát hiện ${found.length}`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
