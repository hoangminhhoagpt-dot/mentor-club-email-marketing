/**
 * send-newsletter.mjs — Gửi Email bảng tin.
 *   12.4 Email bảng tin            = nội dung (Tiêu đề, Nội dung, Trạng thái, Lịch gửi...).
 *   12.3 Danh sách Email bảng tin  = người nhận (status "Đang nhận").
 *
 * Chọn email để gửi:
 *   - Nếu có ENV RECORD_ID → gửi đúng dòng 12.4 đó (dùng cho nút bấm trong Lark).
 *   - Ngược lại → gửi mọi dòng 12.4 trạng thái "Chờ gửi" (và tới lịch nếu có "Lịch gửi").
 * Gửi tới toàn bộ 12.3 "Đang nhận" trừ suppression. Xong: cập nhật "Đã gửi" + "Ngày gửi thực"
 * + đổi trạng thái sang "Đã gửi".
 *
 * Chạy: node scripts/send-newsletter.mjs            (gửi mọi dòng "Chờ gửi")
 *       RECORD_ID=recXXXX node scripts/send-newsletter.mjs   (gửi 1 dòng)
 */
import {
  loadConfig, requireKeys, listAllRecords, updateRecord, F, normEmail, nowMs, sleep,
} from "./lib.mjs";
import { makeTransport, sendOne } from "./email.mjs";
import { buildSuppression, getText } from "./suppression.mjs";

const CFG = loadConfig();
const RECORD_ID = process.env.RECORD_ID || "";

const asMs = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const t = Date.parse(v); return Number.isNaN(t) ? null : t;
};

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret", "smtp.user", "smtp.pass",
    "tables.newsletterMail", "tables.newsletterList"]);
  if (!CFG.tracker.baseUrl) console.warn("⚠️  Chưa cấu hình tracker.baseUrl — email vẫn gửi nhưng KHÔNG tracking mở/click/huỷ.");

  const Tm = CFG.tables.newsletterMail;
  const mSub = F(CFG, "newsletterMail", "subject");
  const mBody = F(CFG, "newsletterMail", "body");
  const mStatus = F(CFG, "newsletterMail", "status");
  const mSched = F(CFG, "newsletterMail", "scheduledAt");
  const mCount = F(CFG, "newsletterMail", "sentCount");
  const mSentAt = F(CFG, "newsletterMail", "sentAt");

  // ---- chọn các email cần gửi ----
  const mails = await listAllRecords(CFG, Tm);
  let queue = mails.filter((r) => {
    if (RECORD_ID) return r.record_id === RECORD_ID;
    const st = getText(r.fields, mStatus);
    if (!/chờ gửi/i.test(st)) return false;
    const sched = asMs(r.fields?.[mSched]);
    return !sched || sched <= Date.now();                 // tới lịch (hoặc không đặt lịch)
  });
  if (!queue.length) { console.log(RECORD_ID ? `Không thấy dòng ${RECORD_ID} hoặc không hợp lệ.` : "Không có email bảng tin nào ở trạng thái 'Chờ gửi' (đến lịch)."); return; }

  // ---- người nhận 12.3 (Đang nhận) trừ suppression ----
  const blocked = await buildSuppression(CFG);
  const subs = await listAllRecords(CFG, CFG.tables.newsletterList);
  const lEmail = F(CFG, "newsletterList", "email");
  const lName = F(CFG, "newsletterList", "name");
  const lStatus = F(CFG, "newsletterList", "status");
  const recipients = [];
  const seen = new Set();
  for (const r of subs) {
    const email = normEmail(getText(r.fields, lEmail));
    const st = getText(r.fields, lStatus);
    if (!email || !email.includes("@")) continue;
    if (st && !/đang nhận/i.test(st)) continue;
    if (blocked.has(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push({ email, name: getText(r.fields, lName) });
  }
  if (!recipients.length) { console.log("Danh sách 12.3 không có người nhận hợp lệ."); return; }

  const transport = makeTransport(CFG);

  for (const mail of queue) {
    const subject = getText(mail.fields, mSub);
    const body = getText(mail.fields, mBody);
    if (!subject) { console.log(`  Bỏ qua dòng ${mail.record_id}: thiếu Tiêu đề.`); continue; }
    console.log(`\n📨 Gửi bảng tin: "${subject}" → ${recipients.length} người`);
    await updateRecord(CFG, Tm, mail.record_id, { [mStatus]: "Đang gửi" });

    let sent = 0, failed = 0, skipped = 0;
    const limit = CFG.send.perRunLimit;
    for (const r of recipients) {
      if (sent + failed >= limit) { console.log(`  Chạm giới hạn ${limit}/lần.`); break; }
      const res = await sendOne(transport, CFG, {
        to: r.email, name: r.name, subject, html: body,
        campaign: `Bảng tin: ${subject}`.slice(0, 100), step: "",
      });
      if (res.ok && !res.skipped) { sent++; }
      else if (res.skipped) { skipped++; }
      else { failed++; console.log(`  ✘ ${r.email}: ${res.error}`); }
      if (CFG.send.delayMs) await sleep(CFG.send.delayMs);
    }

    await updateRecord(CFG, Tm, mail.record_id, {
      [mStatus]: "Đã gửi",
      [mCount]: sent,
      [mSentAt]: nowMs(),
    });
    console.log(`  ✅ Xong "${subject}": gửi ${sent} · lỗi ${failed} · bỏ qua ${skipped}`);
  }

  transport.close?.();
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
