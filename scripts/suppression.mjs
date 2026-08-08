/**
 * suppression.mjs — dựng "danh sách chặn gửi" trước mỗi lần gửi.
 * Gộp 3 nguồn: 12.6 Huỷ nhận + 12.8 Mail lỗi (hard bounce) + 12.7 Lọc mail ảo (không hợp lệ).
 * Ai nằm trong tập này thì KHÔNG gửi.
 */
import { listAllRecords, F, normEmail } from "./lib.mjs";

const getText = (fields, name) => {
  const v = fields?.[name];
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => x?.text || x?.name || x).join(" ");
  if (typeof v === "object") return v.text || v.name || "";
  return String(v);
};

export async function buildSuppression(CFG) {
  const set = new Set();
  const add = (e) => { const n = normEmail(e); if (n) set.add(n); };

  // 12.6 Huỷ nhận — chặn tất cả
  try {
    const recs = await listAllRecords(CFG, CFG.tables.unsubscribe);
    const fEmail = F(CFG, "unsubscribe", "email");
    for (const r of recs) add(getText(r.fields, fEmail));
  } catch (e) { console.warn("⚠️  Không đọc được bảng Huỷ nhận (12.6):", e.message); }

  // 12.8 Mail lỗi — chặn hard bounce / từ chối
  try {
    const recs = await listAllRecords(CFG, CFG.tables.errorList);
    const fEmail = F(CFG, "errorList", "email");
    const fType = F(CFG, "errorList", "errorType");
    for (const r of recs) {
      const type = getText(r.fields, fType);
      // "Bị chặn đầu gửi" (Lark mã 912) KHÔNG chặn: địa chỉ vẫn tốt, lỗi ở phía mình.
      // Phải loại trừ TRƯỚC, vì nhánh dưới bắt cả chuỗi "từ chối".
      if (/bị chặn đầu gửi|912|antispam/i.test(type)) continue;
      if (/hard|từ chối|reject/i.test(type) || !type) add(getText(r.fields, fEmail));
    }
  } catch (e) { console.warn("⚠️  Không đọc được bảng Mail lỗi (12.8):", e.message); }

  // 12.7 Lọc mail ảo — chặn "Không hợp lệ"
  try {
    const recs = await listAllRecords(CFG, CFG.tables.fakeFilter);
    const fEmail = F(CFG, "fakeFilter", "email");
    const fResult = F(CFG, "fakeFilter", "result");
    for (const r of recs) {
      if (/không hợp lệ/i.test(getText(r.fields, fResult))) add(getText(r.fields, fEmail));
    }
  } catch (e) { console.warn("⚠️  Không đọc được bảng Lọc mail ảo (12.7):", e.message); }

  return set;
}

/**
 * Đầu gửi có đang bị Lark chặn không (mã 912).
 *
 * VÌ SAO CẦN: 912 KHÔNG xảy ra lúc gửi. Lark nhận thư và trả 250 OK bình thường, vài phút
 * sau mới dội thư về. Nên phanh "đếm lần từ chối liên tiếp" trong lúc gửi không bao giờ nổ
 * — hệ vẫn in "gửi 2 · lỗi 0" trong khi cả 2 thư đã bị chặn. Cách duy nhất biết được là
 * NGÓ NGƯỢC bảng 12.8 (đã hứng thư dội qua IMAP) trước khi bắn đợt mới.
 *
 * Bị chặn mà cứ bắn tiếp thì chỉ làm uy tín hộp gửi tệ thêm.
 */
export async function kiemChanDauGui(CFG) {
  const cfg = CFG.send?.chanDauGui || {};
  const soGio = cfg.soGio ?? 24;
  const nguong = cfg.nguong ?? 5;
  if (cfg.tat) return { chan: false, dem: 0, soGio, nguong };
  try {
    const recs = await listAllRecords(CFG, CFG.tables.errorList);
    const fType = F(CFG, "errorList", "errorType");
    const fWhen = F(CFG, "errorList", "occurredAt");
    const moc = Date.now() - soGio * 3600000;
    let dem = 0;
    for (const r of recs) {
      const type = getText(r.fields, fType) || r.fields?.[fType] || "";
      if (!/bị chặn đầu gửi|912|antispam/i.test(String(type))) continue;
      const luc = Number(r.fields?.[fWhen] || 0);
      if (luc && luc < moc) continue;
      dem++;
    }
    return { chan: dem >= nguong, dem, soGio, nguong };
  } catch (e) {
    console.warn("⚠️  Không kiểm được tình trạng chặn đầu gửi:", e.message);
    return { chan: false, dem: 0, soGio, nguong };
  }
}

/** In cảnh báo + cho biết có nên dừng không. */
export function baoChanDauGui(kq, boQua) {
  if (!kq.dem) return false;
  console.log(`\n🚫 ${kq.dem} thư bị Lark chặn đầu gửi (mã 912) trong ${kq.soGio} giờ qua.`);
  if (!kq.chan) { console.log("   Chưa tới ngưỡng dừng, vẫn gửi tiếp — nhưng nên để mắt."); return false; }
  if (boQua) { console.log("   (Bỏ qua phanh theo yêu cầu — vẫn gửi.)"); return false; }
  console.log(`   Vượt ngưỡng ${kq.nguong} ⇒ DỪNG, không bắn thêm.`);
  console.log("   912 là Lark chặn ở ĐẦU GỬI, không phải địa chỉ khách hỏng — gửi thêm chỉ");
  console.log("   làm uy tín hộp thư tệ đi. Xử lý gốc trước (xem docs/08-CHAN-DAU-GUI.md),");
  console.log('   hoặc chạy lại với cờ --bo-qua-phanh nếu biết mình đang làm gì.');
  return true;
}

export { getText };
