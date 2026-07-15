/**
 * setup-tables.mjs — bảo đảm 9 bảng (12.1→12.9) CÓ ĐỦ CỘT theo SCHEMA.
 * Idempotent: chỉ TẠO cột còn thiếu (so theo tên), không đụng cột đã có / dữ liệu.
 * Chạy sau khi app đã được cấp quyền trên Base (xem docs/02-cap-quyen-lark.md).
 *
 * Chạy: node scripts/setup-tables.mjs
 */
import { loadConfig, requireKeys, resolveAppToken, larkApi, listFields, SCHEMA } from "./lib.mjs";

const CFG = loadConfig();

async function createField(app, tableId, spec) {
  const body = { field_name: spec.name, type: spec.type };
  if (spec.type === 3 || spec.type === 4) {                 // Single/Multi select
    body.property = { options: (spec.opts || []).map((name) => ({ name })) };
  }
  await larkApi(CFG, "POST", `/open-apis/bitable/v1/apps/${app}/tables/${tableId}/fields`, body);
}

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret"]);
  const app = await resolveAppToken(CFG);
  console.log("app_token:", app, "\n");

  for (const [key, spec] of Object.entries(SCHEMA)) {
    const tableId = CFG.tables[key];
    if (!tableId) { console.log(`• ${key}: (chưa có table id — bỏ qua)`); continue; }
    let existing;
    try { existing = await listFields(CFG, tableId); }
    catch (e) { console.log(`• ${key} [${tableId}] ✘ đọc field lỗi: ${e.message}`); continue; }
    const names = new Set(existing.map((f) => f.field_name));

    const toAdd = Object.values(spec).filter((f) => !names.has(f.name));
    if (!toAdd.length) { console.log(`• ${key} [${tableId}] ✔ đủ cột`); continue; }

    process.stdout.write(`• ${key} [${tableId}] thêm: `);
    for (const f of toAdd) {
      try { await createField(app, tableId, f); process.stdout.write(`"${f.name}" `); }
      catch (e) { process.stdout.write(`\n    ✘ "${f.name}": ${e.message}\n`); }
    }
    process.stdout.write("\n");
  }
  console.log("\n✅ Xong. Lưu ý: cột chính (primary) sẵn có của bảng không bị đổi — nếu muốn cột chính là 'Email' hãy đổi tên thủ công trên Lark.");
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
