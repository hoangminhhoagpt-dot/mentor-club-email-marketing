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

export { getText };
