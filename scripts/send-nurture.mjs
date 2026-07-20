/**
 * send-nurture.mjs — Chiến dịch nuôi dưỡng 365 ngày.
 *   12.1 Danh sách Email Nuôi Dưỡng  = người nhận (có "Ngày bắt đầu" + "Bước gần nhất").
 *   12.2 Chiến dịch Email 365 ngày   = nội dung theo "Ngày" (1..365).
 *
 * Mỗi lần chạy (cron 1 lần/ngày): với từng người "Đang nuôi", gửi ĐÚNG bước kế tiếp
 * (lastStep+1) nếu đã tới ngày đó — đảm bảo gửi tuần tự, không nhảy cóc, 1 email/ngày.
 * Sau khi gửi: cập nhật "Bước gần nhất" + "Lần gửi gần nhất"; xong 365 ngày → "Hoàn thành".
 *
 * Chạy: node scripts/send-nurture.mjs
 */
import {
  loadConfig, requireKeys, listAllRecords, updateRecord, F, normEmail, nowMs, sleep,
} from "./lib.mjs";
import { makeTransport, sendOne } from "./email.mjs";
import { buildSuppression, getText } from "./suppression.mjs";

const CFG = loadConfig();
const DAY_MS = 86400000;
const CAMPAIGN = "Nuôi dưỡng 365";

const num = (v) => (v == null || v === "" ? null : Number(v));
const asMs = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const t = Date.parse(v); return Number.isNaN(t) ? null : t;
};

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret", "smtp.user", "smtp.pass",
    "tables.nurtureList", "tables.campaign365"]);
  if (!CFG.tracker.baseUrl) console.warn("⚠️  Chưa cấu hình tracker.baseUrl — email vẫn gửi nhưng KHÔNG tracking mở/click/huỷ.");

  // ---- 12.2: bản đồ nội dung theo ngày ----
  const camp = await listAllRecords(CFG, CFG.tables.campaign365);
  const cDay = F(CFG, "campaign365", "day");
  const cSub = F(CFG, "campaign365", "subject");
  const cBody = F(CFG, "campaign365", "body");
  const cActive = F(CFG, "campaign365", "active");
  const byDay = new Map();
  let maxDay = 0;
  for (const r of camp) {
    const d = num(getText(r.fields, cDay));
    if (!d) continue;
    if (/tắt/i.test(getText(r.fields, cActive))) continue;       // bỏ ngày bị tắt
    byDay.set(d, { subject: getText(r.fields, cSub), body: getText(r.fields, cBody) });
    if (d > maxDay) maxDay = d;
  }
  if (!byDay.size) { console.log("Bảng 12.2 chưa có nội dung ngày nào (đang bật). Dừng."); return; }
  const sortedDays = [...byDay.keys()].sort((a, b) => a - b);      // cho phép lịch THƯA (1,3,5,8…)

  // ---- suppression ----
  const blocked = await buildSuppression(CFG);

  // ---- 12.1: người nhận ----
  const subs = await listAllRecords(CFG, CFG.tables.nurtureList);
  const nEmail = F(CFG, "nurtureList", "email");
  const nStart = F(CFG, "nurtureList", "startDate");
  const nStatus = F(CFG, "nurtureList", "status");
  const nStep = F(CFG, "nurtureList", "lastStep");
  const nSent = F(CFG, "nurtureList", "lastSentAt");
  const nName = F(CFG, "nurtureList", "name");

  const transport = makeTransport(CFG);
  let sent = 0, failed = 0, skipped = 0, done = 0;
  const limit = CFG.send.perRunLimit;

  for (const r of subs) {
    if (sent + failed >= limit) { console.log(`Đã chạm giới hạn ${limit} email/lần. Dừng, phần còn lại chạy lần sau.`); break; }
    const email = normEmail(getText(r.fields, nEmail));
    const status = getText(r.fields, nStatus);
    const startMs = asMs(r.fields?.[nStart]);
    if (!email || !email.includes("@")) continue;
    if (status && !/đang nuôi/i.test(status)) { skipped++; continue; }   // chỉ gửi người "Đang nuôi"
    if (!startMs) { skipped++; continue; }
    if (blocked.has(email)) { skipped++; continue; }

    const dayIndex = Math.floor((Date.now() - startMs) / DAY_MS) + 1;    // ngày bắt đầu = ngày 1
    if (dayIndex < 1) { skipped++; continue; }                           // chưa tới ngày bắt đầu

    const lastStep = num(getText(r.fields, nStep)) || 0;
    // Ngày kế tiếp CÓ nội dung, chưa gửi (>lastStep) và đã tới hạn (<=dayIndex).
    // Nhờ vậy chuỗi có thể THƯA (1,3,5,8…) mà vẫn gửi tuần tự, mỗi lần chạy đẩy 1 bước.
    const targetStep = sortedDays.find((d) => d > lastStep && d <= dayIndex);
    if (targetStep == null) {                                            // đã đuổi kịp lịch, hoặc hết chuỗi
      if (lastStep >= maxDay && lastStep > 0) {
        await updateRecord(CFG, CFG.tables.nurtureList, r.record_id, { [nStatus]: "Hoàn thành" });
        done++;
      } else skipped++;
      continue;
    }
    const content = byDay.get(targetStep);
    if (!content || !content.subject) { skipped++; continue; }           // ngày này chưa soạn nội dung → chờ

    const name = getText(r.fields, nName);
    const res = await sendOne(transport, CFG, {
      to: email, name, subject: content.subject, html: content.body,
      campaign: CAMPAIGN, step: `Ngày ${targetStep}`,
    });

    if (res.ok) {
      // DRY-RUN TUYỆT ĐỐI KHÔNG GHI: trước đây vẫn ghi "Bước gần nhất" dù không gửi email nào
      // → chạy thử 1 lần là đốt mất bước đó của CẢ danh sách, lần chạy thật nhảy sang bước sau,
      // email bị mất câm lặng. Chạy thử phải là chạy thử.
      if (res.skipped) { skipped++; console.log(`  (dry-run) Ngày ${targetStep} → ${email}  [không ghi Lark]`); }
      else {
        const patch = { [nStep]: targetStep, [nSent]: nowMs() };
        if (targetStep >= maxDay) patch[nStatus] = "Hoàn thành";
        await updateRecord(CFG, CFG.tables.nurtureList, r.record_id, patch);
        sent++; console.log(`  ✔ Ngày ${targetStep} → ${email}`);
      }
    } else {
      failed++; console.log(`  ✘ LỖI ${email}: ${res.error}`);
    }
    if (CFG.send.delayMs) await sleep(CFG.send.delayMs);
  }

  transport.close?.();
  console.log(`\n✅ Nuôi dưỡng: gửi ${sent} · lỗi ${failed} · bỏ qua ${skipped} · hoàn thành ${done}`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
