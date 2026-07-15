/**
 * filter-fake.mjs — bảng 12.7 "Lọc mail ảo".
 * Quét các dòng CHƯA có "Kết quả" (hoặc --all để kiểm lại toàn bộ), kiểm tra từng email,
 * ghi Kết quả / Lý do / Có MX / Dùng 1 lần / Thời gian kiểm tra ngược lại bảng.
 * Có thể nạp thêm email mới qua ENV EMAILS="a@x.com,b@y.com" (mỗi email tạo 1 dòng).
 *
 * Chạy: node scripts/filter-fake.mjs [--all]
 */
import { loadConfig, requireKeys, listAllRecords, createRecord, updateRecord, F, normEmail, nowMs, sleep } from "./lib.mjs";
import { validateEmail } from "./validate.mjs";
import { getText } from "./suppression.mjs";

const CFG = loadConfig();
const ALL = process.argv.includes("--all");

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret", "tables.fakeFilter"]);
  const T = CFG.tables.fakeFilter;
  const fEmail = F(CFG, "fakeFilter", "email");
  const fResult = F(CFG, "fakeFilter", "result");
  const fReason = F(CFG, "fakeFilter", "reason");
  const fHasMx = F(CFG, "fakeFilter", "hasMx");
  const fDisp = F(CFG, "fakeFilter", "disposable");
  const fChecked = F(CFG, "fakeFilter", "checkedAt");

  // Nạp email mới từ ENV (tuỳ chọn)
  const seed = (process.env.EMAILS || "").split(/[\s,;]+/).map(normEmail).filter(Boolean);
  const existing = await listAllRecords(CFG, T);
  const existingEmails = new Set(existing.map((r) => normEmail(getText(r.fields, fEmail))));
  for (const e of seed) {
    if (!existingEmails.has(e)) {
      const rec = await createRecord(CFG, T, { [fEmail]: e });
      existing.push(rec);
      existingEmails.add(e);
    }
  }

  let checked = 0, valid = 0, invalid = 0, suspect = 0;
  for (const r of existing) {
    const email = normEmail(getText(r.fields, fEmail));
    if (!email) continue;
    const hasResult = !!getText(r.fields, fResult);
    if (hasResult && !ALL) continue;

    const v = await validateEmail(email);
    await updateRecord(CFG, T, r.record_id, {
      [fResult]: v.result,
      [fReason]: v.reason,
      [fHasMx]: !!v.hasMx,
      [fDisp]: !!v.disposable,
      [fChecked]: nowMs(),
    });
    checked++;
    if (v.result === "Hợp lệ") valid++;
    else if (v.result === "Nghi ngờ") suspect++;
    else invalid++;
    console.log(`  ${v.result.padEnd(12)} ${email}${v.reason ? "  — " + v.reason : ""}`);
    await sleep(120);
  }

  console.log(`\n✅ Lọc mail ảo xong: kiểm ${checked} · hợp lệ ${valid} · nghi ngờ ${suspect} · không hợp lệ ${invalid}`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
