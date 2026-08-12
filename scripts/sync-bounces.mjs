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

// Tiêu đề thư hay bị mã hoá =?UTF-8?B?…?= — không giải ra thì bảng đầy ký tự lạ.
function goMaTieuDe(s) {
  return String(s || "").replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, bang, kieu, than) => {
    try {
      if (/^b$/i.test(kieu)) return Buffer.from(than, "base64").toString(bang.toLowerCase().includes("utf") ? "utf8" : "latin1");
      return Buffer.from(than.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (__, h) => String.fromCharCode(parseInt(h, 16))), "binary")
        .toString(bang.toLowerCase().includes("utf") ? "utf8" : "latin1");
    } catch { return than; }
  }).replace(/\s+/g, " ").trim();
}

// Phần thân thư của Lark là quoted-printable: chữ tiếng Việt nằm dạng =C3=BA.
// Phải dựng lại theo BYTE rồi mới đọc ra UTF-8, ghép từng ký tự một là ra chữ vỡ.
function goQP(s) {
  const byte = [];
  const t = String(s || "");
  for (let i = 0; i < t.length; i++) {
    const m = /^=([0-9A-Fa-f]{2})/.exec(t.slice(i, i + 3));
    if (m) { byte.push(parseInt(m[1], 16)); i += 2; }
    else byte.push(t.charCodeAt(i) & 0xff);
  }
  return Buffer.from(byte).toString("utf8")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// Rút nguyên văn máy chủ trả về thành MỘT câu chuẩn. Cột "Dịch" trong bảng 12.8 dịch đúng
// năm câu này sang tiếng Việt — viết khác đi là cột Dịch trơ ra tiếng Anh.
function lyDo(s, status, diag) {
  const t = `${status} ${diag} ${s.slice(0, 4000)}`;
  if (/\b912\b|antispam|suspected to be spam|spam/i.test(t)) return "Suspected spam";
  if (/5\.2\.2|quota|mailbox\s*(is\s*)?full|over quota/i.test(t)) return "Mailbox is full";
  if (/no such user|user unknown|unknown user|user not found/i.test(t)) return "User not found";
  if (/5\.1\.1|does not exist|invalid recipient|address rejected|recipient rejected/i.test(t)) return "Invalid recipient address";
  return "Message was bounced back";
}

// Hộp thư nào đã gửi lá thư hỏng này — để lọc báo cáo theo thương hiệu.
function hopThuGui(diaChi) {
  const a = String(diaChi || "").toLowerCase();
  if (/mentorcamp|mentor-camp/.test(a)) return "Mentor Camp";
  if (/missaodai|aodai/.test(a)) return "Miss Áo Dài";
  if (/hoangminhhoa|minhhoa/.test(a)) return "Hoàng Minh Hoá Và Cộng Sự";
  return "Khác";
}

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
  // Lark KHÔNG gửi Diagnostic-Code chuẩn. Mã lỗi thật nằm cuối thư, trong khối
  // "Administrator diagnostic information" — ví dụ "912 This mail is rejected by antispam system".
  const diagLark = (s.match(/Administrator diagnostic information<\/div>\s*<div>([^<]{3,300})<\/div>/i) || [])[1] || "";
  const diag = (s.match(/Diagnostic-Code:\s*([^\r\n]+)/i) || [])[1] || goQP(diagLark)
            || (s.match(/Email delivery failed[^\r\n<]*/i) || [])[0] || "";
  // Lark chỉ dội thư lại sau khi đã bỏ cuộc → mặc định coi là Hard, chỉ hạ xuống Soft nếu thấy mã 4.x.x
  let type = "Hard bounce";
  if (/^4\./.test(status) || /\b45\d\b/.test(diag)) type = "Soft bounce";
  // BỘ LỌC LARK TỪ CHỐI (mã 912 / "suspected to be spam") KHÔNG PHẢI ĐỊA CHỈ HỎNG.
  // Lỗi nằm ở phía mình, người nhận hoàn toàn bình thường. Trước đây mã 912 không khớp 4.x.x
  // nên rơi vào nhánh "Hard bounce" → khách TỐT bị chặn vĩnh viễn qua suppression.
  // Phải xét SAU cùng để đè lên hai nhánh trên.
  if (/\b912\b|antispam|suspected to be spam/i.test(s)) type = "Bị chặn đầu gửi";
  const detail = [status && `Status ${status}`, diag].filter(Boolean).join(" — ").slice(0, 500);

  // Lark KHÔNG đính kèm thư gốc, nên không có Subject/Message-ID của thư gốc dưới dạng header.
  // Ba mẩu đó nằm rải rác chỗ khác:
  //   · Message-ID thư gốc  → header In-Reply-To của thư dội
  //   · Tiêu đề thư gốc     → câu 'Failed to send "…" to the following recipients' trong phần HTML
  //   · Hộp thư đã gửi      → tên miền trong In-Reply-To, hoặc Delivered-To
  const cuoi = (re) => { const ds = [...s.matchAll(re)]; return ds.length ? ds[ds.length - 1][1].trim() : ""; };
  const inReplyTo = (s.match(/^In-Reply-To:\s*(.+)$/im) || [])[1]?.trim() || "";
  const messageId = (inReplyTo || cuoi(/^Message-I[Dd]:\s*(.+)$/gm)).slice(0, 200);
  const tuHtml = (s.match(/Failed to send\s*(?:&#34;|&quot;|")([\s\S]{1,400}?)(?:&#34;|&quot;|")\s*to/i) || [])[1] || "";
  // Chỉ lấy header Subject khi thư dội có ĐÍNH KÈM thư gốc (tức xuất hiện từ 2 Subject trở lên).
  // Bằng không sẽ chép nhầm tiêu đề của chính thư dội — "Message was bounced back".
  const dsSubject = [...s.matchAll(/^Subject:\s*(.+)$/gm)];
  const subject = (goQP(tuHtml)
    || (dsSubject.length > 1 ? goMaTieuDe(dsSubject[dsSubject.length - 1][1]) : "")).slice(0, 200);
  const deliveredTo = (s.match(/^Delivered-To:\s*(.+)$/im) || [])[1]?.trim() || "";
  const diaChiGui = (inReplyTo.match(/@([^\s>]+)/) || [])[1] || deliveredTo;

  // Thời điểm thư BỊ DỘI, lấy từ header Date của chính thư dội.
  // Trước đây ghi nowMs() — tức thời điểm ĐỒNG BỘ, không phải thời điểm bị chặn. Mà bộ đồng bộ
  // chạy lại mỗi sáng và ghi đè cả trăm dòng cũ ⇒ mọi thư dội từ đời nào cũng trông như "vừa
  // xảy ra", làm phanh chống chặn nổ vĩnh viễn dù thực tế đã lâu không có thư nào bị chặn.
  const luc = Date.parse((s.match(/^Date:\s*(.+)$/im) || [])[1] || "");

  return {
    email, type, detail: detail || "Bounce (Lark)", messageId, subject,
    luc: Number.isFinite(luc) ? luc : null,
    // Vài Message-ID mang tên máy chủ nội bộ (…@n105-035-086) chứ không phải tên miền thật.
    // Lúc đó hộp thư nhận thư dội chính là hộp đã gửi đi.
    sender: hopThuGui(diaChiGui) === "Khác" ? hopThuGui(deliveredTo) : hopThuGui(diaChiGui),
    reason: lyDo(s, status, diag),
  };
}

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret", "imap.user", "imap.pass", "tables.errorList"]);
  const T = CFG.tables.errorList;
  const eEmail = F(CFG, "errorList", "email");
  const eType = F(CFG, "errorList", "errorType");
  const eDetail = F(CFG, "errorList", "detail");
  const eWhen = F(CFG, "errorList", "occurredAt");
  const eMsgId = F(CFG, "errorList", "messageId");
  const eSubj = F(CFG, "errorList", "mailSubject");
  const eBox = F(CFG, "errorList", "senderBox");
  const eReason = F(CFG, "errorList", "reason");

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
    const fields = { [eEmail]: b.email, [eType]: b.type, [eDetail]: b.detail, [eReason]: b.reason,
      [eWhen]: b.luc ?? nowMs() };
    if (b.messageId) fields[eMsgId] = b.messageId;
    if (b.subject) fields[eSubj] = b.subject;
    if (b.sender) fields[eBox] = b.sender;
    if (byEmail.has(b.email)) { await updateRecord(CFG, T, byEmail.get(b.email), fields); updated++; }
    else { const rec = await createRecord(CFG, T, fields); byEmail.set(b.email, rec.record_id); created++; }
    console.log(`  ${b.type.padEnd(12)} ${b.email}`);
  }
  console.log(`\n✅ Đồng bộ bounce (${DAYS} ngày): mới ${created} · cập nhật ${updated} · tổng phát hiện ${found.length}`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
