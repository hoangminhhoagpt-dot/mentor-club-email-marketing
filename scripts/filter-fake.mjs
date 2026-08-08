/**
 * filter-fake.mjs — bảng 12.7 "Lọc mail ảo".
 * Quét các dòng CHƯA có "Kết quả" (hoặc --all để kiểm lại toàn bộ), kiểm tra từng email,
 * ghi Kết quả / Lý do / Có MX / Dùng 1 lần / Thời gian kiểm tra ngược lại bảng.
 * TỰ GOM danh sách cần kiểm từ 12.1 (nuôi dưỡng) + 12.3 (bản tin) — địa chỉ nào chưa có
 * trong 12.7 thì thêm dòng mới. Trước đây script chỉ kiểm những dòng ĐÃ nằm sẵn trong 12.7,
 * mà bảng đó thì không ai đổ vào ⇒ bấm nút bao nhiêu lần cũng chỉ ra "kiểm 0" và vẫn báo
 * thành công. Muốn giữ nếp cũ thì thêm cờ --khong-gom.
 * Có thể nạp thêm email lẻ qua ENV EMAILS="a@x.com,b@y.com".
 *
 * Chạy: node scripts/filter-fake.mjs [--all] [--khong-gom]
 */
import { loadConfig, requireKeys, listAllRecords, createRecord, updateRecord, F, normEmail, nowMs, sleep } from "./lib.mjs";
import { validateEmail } from "./validate.mjs";
import { getText } from "./suppression.mjs";

const CFG = loadConfig();
const ALL = process.argv.includes("--all");
const KHONG_GOM = process.argv.includes("--khong-gom");

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret", "tables.fakeFilter"]);
  const T = CFG.tables.fakeFilter;
  const fEmail = F(CFG, "fakeFilter", "email");
  const fResult = F(CFG, "fakeFilter", "result");
  const fReason = F(CFG, "fakeFilter", "reason");
  const fHasMx = F(CFG, "fakeFilter", "hasMx");
  const fDisp = F(CFG, "fakeFilter", "disposable");
  const fChecked = F(CFG, "fakeFilter", "checkedAt");

  const existing = await listAllRecords(CFG, T);
  const existingEmails = new Set(existing.map((r) => normEmail(getText(r.fields, fEmail))));

  // Gom địa chỉ cần kiểm: ENV EMAILS + toàn bộ người trong 12.1 và 12.3.
  const seed = (process.env.EMAILS || "").split(/[\s,;]+/).map(normEmail).filter(Boolean);
  if (!KHONG_GOM) {
    for (const [bang, khoa] of [["nurtureList", "email"], ["newsletterList", "email"]]) {
      const tid = CFG.tables?.[bang];
      if (!tid) continue;
      for (const r of await listAllRecords(CFG, tid)) {
        const e = normEmail(getText(r.fields, F(CFG, bang, khoa)));
        if (e && e.includes("@")) seed.push(e);
      }
    }
    const them = seed.filter((e) => !existingEmails.has(e)).length;
    if (them) console.log(`   gom ${them} địa chỉ mới từ 12.1 + 12.3 vào 12.7`);
  }

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
    // "Nghi ngờ" KHÔNG phải kết luận — đó là lúc DNS trục trặc nên chưa dám phán, và chính
    // lời nhắn ghi "chạy lại sau". Coi nó như đã xong thì địa chỉ đó mắc kẹt vĩnh viễn ở
    // trạng thái lấp lửng, lần chạy nào cũng bỏ qua.
    const ketQua = getText(r.fields, fResult);
    if (ketQua && !ALL && !/nghi ngờ/i.test(ketQua)) continue;

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
