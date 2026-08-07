/**
 * mo-lai-nuoi-duong.mjs — CỨU những người bị đóng "Hoàn thành" quá sớm.
 *
 * Bản cũ của send-nurture đóng sổ khi người nhận đi hết NỘI DUNG ĐÃ SOẠN trong 12.2,
 * chứ không phải hết CHƯƠNG TRÌNH. Dựng hệ xong soạn 1 ngày rồi chạy thử là cả danh sách
 * bị đóng sau đúng 1 thư — về sau đổ đủ 365 ngày thì không ai nhận nữa.
 * Code đã vá, nhưng dữ liệu đã hỏng thì phải mở lại bằng tay. Đó là việc của file này.
 *
 * MẶC ĐỊNH CHỈ LIỆT KÊ, không sửa gì. Muốn sửa thật thì thêm cờ --that.
 *
 * Chạy: node scripts/mo-lai-nuoi-duong.mjs           (xem ai đang bị đóng oan)
 *       node scripts/mo-lai-nuoi-duong.mjs --that    (mở lại thật)
 */
import { loadConfig, requireKeys, listAllRecords, updateRecord, F, normEmail } from "./lib.mjs";
import { getText } from "./suppression.mjs";

const CFG = loadConfig();
const THAT = process.argv.includes("--that");
const toNum = (v) => (v == null || v === "" ? 0 : Number(v) || 0);

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret", "tables.nurtureList", "tables.campaign365"]);
  const totalDays = CFG.nurture.totalDays;

  const cDay = F(CFG, "campaign365", "day");
  const camp = await listAllRecords(CFG, CFG.tables.campaign365);
  const maxDay = Math.max(0, ...camp.map((r) => toNum(r.fields?.[cDay])));

  const T = CFG.tables.nurtureList;
  const nEmail = F(CFG, "nurtureList", "email");
  const nStatus = F(CFG, "nurtureList", "status");
  const nStep = F(CFG, "nurtureList", "lastStep");
  const subs = await listAllRecords(CFG, T);

  // Bị đóng oan = đang "Hoàn thành" nhưng chưa đi hết chương trình.
  const oan = subs.filter((r) => {
    const st = getText(r.fields, nStatus);
    if (!/hoàn thành/i.test(st)) return false;
    return toNum(r.fields?.[nStep]) < totalDays;
  });

  console.log(`Chương trình đặt ${totalDays} ngày · nội dung 12.2 mới soạn tới Ngày ${maxDay}`);
  console.log(`Tổng ${subs.length} người trong 12.1 · bị đóng sớm: ${oan.length}\n`);
  if (!oan.length) { console.log("Không có ai bị đóng oan. Không cần làm gì."); return; }

  for (const r of oan) {
    const email = normEmail(getText(r.fields, nEmail));
    const buoc = toNum(r.fields?.[nStep]);
    console.log(`  ${email.padEnd(40)} mới tới Ngày ${buoc}/${totalDays}`);
  }

  if (!THAT) {
    console.log(`\n(chưa sửa gì — chạy lại kèm --that để mở lại ${oan.length} người này về "Đang nuôi")`);
    return;
  }

  let ok = 0;
  for (const r of oan) {
    await updateRecord(CFG, T, r.record_id, { [nStatus]: "Đang nuôi" });
    ok++;
  }
  console.log(`\n✅ Đã mở lại ${ok} người về "Đang nuôi". Họ sẽ nhận tiếp từ bước kế tiếp khi 12.2 có nội dung.`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
