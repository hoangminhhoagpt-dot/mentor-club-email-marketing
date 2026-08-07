/**
 * nap-ban-tin.mjs — nạp nội dung bản tin từ file .md vào bảng 12.4.
 *
 * File .md là NGUỒN SỰ THẬT: sửa ở đó rồi chạy lại, bảng cập nhật theo (upsert theo TIÊU ĐỀ).
 *
 * ⚠️ LUÔN nạp ở trạng thái "Nháp". Máy KHÔNG được tự đưa bản tin vào hàng đợi gửi —
 * muốn phát thì người tự đổi sang "Chờ gửi" trên bảng. Một lệnh chạy nhầm mà lỡ đặt
 * "Chờ gửi" là cả danh sách nhận thư chưa ai duyệt.
 *
 * Định dạng file (xem content/ban-tin.md):
 *     ## Bản tin
 *     **Tiêu đề:** Thứ khiến bạn bận mà không giàu
 *     ```
 *     <nội dung văn bản thuần>
 *     ```
 *
 * Chạy: node scripts/nap-ban-tin.mjs content/ban-tin.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, requireKeys, listAllRecords, createRecord, updateRecord, F } from "./lib.mjs";
import { getText } from "./suppression.mjs";

const CFG = loadConfig();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.argv[2] || "content/ban-tin.md";

function bocBanTin(md) {
  const ra = [];
  const re = /^##\s*Bản tin\s*$[\r\n]+\*\*Tiêu đề:\*\*\s*(.+?)\s*$[\r\n]+```[\r\n]+([\s\S]*?)[\r\n]+```/gm;
  let m;
  while ((m = re.exec(md)) !== null) ra.push({ tieuDe: m[1].trim(), noiDung: m[2].trim() });
  return ra;
}

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret", "tables.newsletterMail"]);

  const duongDan = path.isAbsolute(FILE) ? FILE : path.join(__dirname, "..", FILE);
  if (!fs.existsSync(duongDan)) { console.error(`❌ Không thấy file: ${duongDan}`); process.exit(1); }
  const list = bocBanTin(fs.readFileSync(duongDan, "utf8"));
  if (!list.length) { console.error("❌ Không bóc được bản tin nào — kiểm lại định dạng file."); process.exit(1); }

  const T = CFG.tables.newsletterMail;
  const mSub = F(CFG, "newsletterMail", "subject");
  const mBody = F(CFG, "newsletterMail", "body");
  const mStatus = F(CFG, "newsletterMail", "status");
  const mCount = F(CFG, "newsletterMail", "sentCount");

  const daCo = await listAllRecords(CFG, T);
  const theoTieuDe = new Map(daCo.map((r) => [getText(r.fields, mSub), r]));

  let moi = 0, capNhat = 0, boQua = 0;
  for (const b of list) {
    const cu = theoTieuDe.get(b.tieuDe);
    if (cu) {
      // ĐÃ GỬI rồi thì KHÔNG đụng vào: sửa nội dung một bản tin đã phát là làm sai lịch sử,
      // và nếu ai đó bật lại "Chờ gửi" thì người cũ nhận trùng.
      const daGui = /đã gửi/i.test(getText(cu.fields, mStatus));
      if (daGui) { console.log(`  bỏ qua (đã gửi rồi) · ${b.tieuDe}`); boQua++; continue; }
      await updateRecord(CFG, T, cu.record_id, { [mSub]: b.tieuDe, [mBody]: b.noiDung });
      console.log(`  cập nhật · ${b.tieuDe}`);
      capNhat++;
    } else {
      await createRecord(CFG, T, { [mSub]: b.tieuDe, [mBody]: b.noiDung, [mStatus]: "Nháp", [mCount]: 0 });
      console.log(`  tạo mới  · ${b.tieuDe}`);
      moi++;
    }
  }

  console.log(`\n✅ Nạp xong ${list.length} bản tin vào 12.4: tạo mới ${moi} · cập nhật ${capNhat} · bỏ qua ${boQua}`);
  console.log(`   Tất cả để ở trạng thái "Nháp". Muốn phát: mở bảng 12.4, đổi trạng thái sang "Chờ gửi".`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
