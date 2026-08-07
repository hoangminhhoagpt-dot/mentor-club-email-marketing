/**
 * nap-noi-dung.mjs — nạp nội dung chuỗi nuôi dưỡng từ file .md vào bảng 12.2.
 *
 * File .md là NGUỒN SỰ THẬT: sửa ở đó rồi chạy lại, bảng tự cập nhật.
 * Upsert theo số "Ngày" nên chạy bao nhiêu lần cũng không đẻ dòng trùng.
 *
 * Định dạng file (xem content/nurture-14-ngay.md):
 *     ## Ngày 3
 *     **Tiêu đề:** Thứ đã thay đổi tất cả
 *     ```
 *     <nội dung văn bản thuần>
 *     ```
 *
 * Chạy: node scripts/nap-noi-dung.mjs content/nurture-14-ngay.md
 *       node scripts/nap-noi-dung.mjs content/nurture-14-ngay.md --tat   (nạp nhưng để Tắt)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, requireKeys, listAllRecords, createRecord, updateRecord, F } from "./lib.mjs";
import { getText } from "./suppression.mjs";

const CFG = loadConfig();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.argv[2] || "content/nurture-14-ngay.md";
const TAT = process.argv.includes("--tat");
const toNum = (v) => (v == null || v === "" ? 0 : Number(v) || 0);

/** Bóc các email ra khỏi file markdown. */
function bocEmail(md) {
  const ra = [];
  // Mỗi khối bắt đầu bằng "## Ngày N", có dòng "**Tiêu đề:**", rồi nội dung trong ```
  const re = /^##\s*Ngày\s+(\d+)\s*$[\r\n]+\*\*Tiêu đề:\*\*\s*(.+?)\s*$[\r\n]+```[\r\n]+([\s\S]*?)[\r\n]+```/gm;
  let m;
  while ((m = re.exec(md)) !== null) {
    ra.push({ ngay: Number(m[1]), tieuDe: m[2].trim(), noiDung: m[3].trim() });
  }
  return ra;
}

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret", "tables.campaign365"]);

  const duongDan = path.isAbsolute(FILE) ? FILE : path.join(__dirname, "..", FILE);
  if (!fs.existsSync(duongDan)) { console.error(`❌ Không thấy file: ${duongDan}`); process.exit(1); }
  const emails = bocEmail(fs.readFileSync(duongDan, "utf8"));
  if (!emails.length) { console.error("❌ Không bóc được email nào — kiểm lại định dạng file."); process.exit(1); }

  // Kiểm trùng số ngày ngay trong file, tránh nạp đè nhầm.
  const dem = new Map();
  for (const e of emails) dem.set(e.ngay, (dem.get(e.ngay) || 0) + 1);
  const trung = [...dem.entries()].filter(([, n]) => n > 1).map(([d]) => d);
  if (trung.length) { console.error(`❌ File có số Ngày trùng nhau: ${trung.join(", ")}`); process.exit(1); }

  const T = CFG.tables.campaign365;
  const cDay = F(CFG, "campaign365", "day");
  const cSub = F(CFG, "campaign365", "subject");
  const cBody = F(CFG, "campaign365", "body");
  const cActive = F(CFG, "campaign365", "active");

  const daCo = await listAllRecords(CFG, T);
  const theoNgay = new Map(daCo.map((r) => [toNum(r.fields?.[cDay]), r.record_id]));

  let moi = 0, capNhat = 0;
  for (const e of emails.sort((a, b) => a.ngay - b.ngay)) {
    const fields = {
      [cDay]: e.ngay,
      [cSub]: e.tieuDe,
      [cBody]: e.noiDung,
      [cActive]: TAT ? "Tắt" : "Bật",
    };
    if (theoNgay.has(e.ngay)) { await updateRecord(CFG, T, theoNgay.get(e.ngay), fields); capNhat++; }
    else { await createRecord(CFG, T, fields); moi++; }
    console.log(`  Ngày ${String(e.ngay).padStart(3)} · ${e.tieuDe}`);
  }

  console.log(`\n✅ Nạp xong ${emails.length} email vào 12.2: tạo mới ${moi} · cập nhật ${capNhat} · trạng thái ${TAT ? "Tắt" : "Bật"}`);
  console.log(`   Nguồn: ${FILE} — sửa file rồi chạy lại là bảng cập nhật theo.`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
