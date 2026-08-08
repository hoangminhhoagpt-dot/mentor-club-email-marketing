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
  loadConfig, requireKeys, listAllRecords, updateRecord, F, normEmail, nowMs, sleep, larkToken, nextDelay,
} from "./lib.mjs";
import { makeTransport, sendOne, isAntispamReject, taiDinhKem } from "./email.mjs";
import { buildSuppression, getText, kiemChanDauGui, baoChanDauGui } from "./suppression.mjs";

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
  const mLink = F(CFG, "newsletterMail", "link");
  const mFile = F(CFG, "newsletterMail", "file");

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
  // Ngó bảng 12.8 xem đầu gửi có đang bị Lark chặn không. Phải hỏi TRƯỚC khi bắn, vì
  // mã 912 chỉ lộ ra qua thư dội vài phút sau, không lộ ra lúc gửi.
  if (baoChanDauGui(await kiemChanDauGui(CFG), process.argv.includes("--bo-qua-phanh"))) return;

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
    // TIẾP TỤC TỪ CHỖ DỞ: "Số đã gửi" đóng vai con trỏ. Trước đây lần chạy nào cũng bắt đầu
    // lại từ đầu danh sách, mà cuối vòng vẫn đánh dấu "Đã gửi" — nên bản tin lớn hơn perRunLimit
    // thì người ở nửa sau KHÔNG BAO GIỜ nhận được, còn người ở đầu thì bị gửi trùng.
    const doneBefore = Number(getText(mail.fields, mCount)) || 0;
    const pending = recipients.slice(doneBefore);
    console.log(`\n📨 Gửi bảng tin: "${subject}" → ${pending.length}/${recipients.length} người còn lại${doneBefore ? ` (đã gửi ${doneBefore} lần trước)` : ""}${CFG.send.dryRun ? "  [DRY-RUN — không gửi, không ghi Lark]" : ""}`);
    if (!pending.length) {
      if (!CFG.send.dryRun) await updateRecord(CFG, Tm, mail.record_id, { [mStatus]: "Thành công", [mSentAt]: nowMs() });
      console.log("  Mọi người trong danh sách đã nhận. Đánh dấu hoàn tất.");
      continue;
    }
    // ĐỔI TRẠNG THÁI NGAY khi bắt đầu, trước cả thư đầu tiên: người bấm nút phải thấy
    // bảng phản hồi trong vài giây, không thì họ tưởng nút hỏng và bấm lại lần nữa.
    if (!CFG.send.dryRun) await updateRecord(CFG, Tm, mail.record_id, { [mStatus]: "Đang gửi" });

    // Link và tệp đính kèm của chính dòng bản tin này
    // Ô URL của Lark là {link, text}. Phải lấy .link — getText() trả .text tức phần CHỮ HIỂN THỊ,
    // đem chữ đó nhét vào href thì ra liên kết hỏng.
    const oLink = mail.fields?.[mLink];
    const link = (oLink && typeof oLink === "object" && oLink.link) ? oLink.link
               : (typeof oLink === "string" ? oLink : "");
    const dinhKem = await taiDinhKem(CFG, mail.fields?.[mFile], await larkToken(CFG));
    if (link) console.log(`  ↪ kèm link: ${link}`);
    if (dinhKem.length) console.log(`  📎 đính ${dinhKem.length} tệp: ${dinhKem.map((f) => f.filename).join(", ")}`);

    let sent = 0, failed = 0, skipped = 0, streak = 0, blockedByFilter = 0, processed = 0;
    const limit = CFG.send.perRunLimit;
    const stopAfter = CFG.send.stopAfterFails;
    for (const r of pending) {
      if (sent + failed >= limit) { console.log(`  Chạm giới hạn ${limit}/lần.`); break; }
      processed++;
      const res = await sendOne(transport, CFG, {
        to: r.email, name: r.name, subject, html: body, link, files: dinhKem,
        campaign: `Bảng tin: ${subject}`.slice(0, 100), step: "",
      });
      if (res.ok && !res.skipped) { sent++; streak = 0; }
      else if (res.skipped) { skipped++; }
      else {
        failed++; streak++;
        if (isAntispamReject(res.error)) blockedByFilter++;
        console.log(`  ✘ ${r.email}: ${res.error}`);
        if (streak >= stopAfter) {
          console.log(`\n  🛑 DỪNG: ${streak} lần bị từ chối liên tiếp. Không bắn tiếp danh sách.`);
          break;
        }
      }
      if (CFG.send.delayMs) await sleep(nextDelay(CFG));
    }
    if (blockedByFilter) {
      console.log(`  ⚠️  ${blockedByFilter} thư bị BỘ LỌC LARK từ chối (mã 912) — KHÔNG phải địa chỉ hỏng.`);
    }

    // Dry-run KHÔNG được lật trạng thái: đánh dấu "Đã gửi" với 0 email nghĩa là bản tin
    // vĩnh viễn không bao giờ được phát thật (queue chỉ lấy dòng chưa gửi).
    const totalDone = doneBefore + processed;
    const hetDanhSach = totalDone >= recipients.length;
    if (!CFG.send.dryRun) {
      await updateRecord(CFG, Tm, mail.record_id, {
        // Chưa hết danh sách thì trả về "Chờ gửi" để lần chạy sau ĐI TIẾP, không phải làm lại.
        [mStatus]: hetDanhSach ? (failed && !sent ? "Thất bại" : "Thành công") : "Chờ gửi",
        [mCount]: totalDone,
        [mSentAt]: nowMs(),
      });
    }
    console.log(`  ✅ Xong "${subject}": gửi ${sent} · lỗi ${failed} · bỏ qua ${skipped}`);
    if (!hetDanhSach) {
      console.log(`  ⏸️  Còn ${recipients.length - totalDone} người chưa nhận — lần chạy sau tự đi tiếp từ đó.`);
    }
  }

  transport.close?.();
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
