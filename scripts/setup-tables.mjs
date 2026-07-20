/**
 * setup-tables.mjs — dựng bộ 9 bảng (12.1→12.9) vào MỘT Lark Base bất kỳ.
 *
 * Hai việc, đều idempotent:
 *   1) Bảng CHƯA có (so theo tên trong TABLE_META) → TẠO mới kèm đủ cột.
 *   2) Bảng ĐÃ có                                  → chỉ thêm CỘT còn thiếu, không đụng dữ liệu.
 *
 * Base đích: --base <app_token>  >  config.appToken  >  resolve từ wikiToken.
 * Chạy sau khi app đã được cấp quyền SỬA trên Base (xem docs/02-cap-quyen-lark.md).
 *
 * Chạy: node scripts/setup-tables.mjs [--base ZM8q...] [--only 12.1,12.7]
 */
import {
  loadConfig, requireKeys, resolveAppToken, larkApi, listFields,
  SCHEMA, TABLE_META, buildFields, fieldBody,
} from "./lib.mjs";

const CFG = loadConfig();

// ---- args ----
const argv = process.argv;
const arg = (flag) => { const i = argv.indexOf(flag); return i > -1 ? argv[i + 1] : null; };
const BASE_ARG = arg("--base");
const ONLY = arg("--only")?.split(",").map((s) => s.trim()).filter(Boolean) || null;

/** "12.1" (hoặc key logic) → key logic trong SCHEMA. */
const keyOf = (want) =>
  Object.keys(TABLE_META).find((k) => k === want || TABLE_META[k].name.startsWith(want + " "));

async function listTables(app) {
  const out = []; let pageToken = null;
  do {
    const qs = new URLSearchParams({ page_size: "100" });
    if (pageToken) qs.set("page_token", pageToken);
    const data = await larkApi(CFG, "GET", `/open-apis/bitable/v1/apps/${app}/tables?${qs}`);
    out.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token : null;
  } while (pageToken);
  return out;
}

async function createTable(app, key) {
  const meta = TABLE_META[key];
  const data = await larkApi(CFG, "POST", `/open-apis/bitable/v1/apps/${app}/tables`, {
    table: { name: meta.name, default_view_name: meta.view, fields: buildFields(key) },
  });
  return data.table_id;
}

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret"]);
  const app = BASE_ARG || (await resolveAppToken(CFG));
  console.log(`Base đích: ${app}\n`);

  const existing = await listTables(app);
  const byName = new Map(existing.map((t) => [t.name, t.table_id]));

  let keys = Object.keys(TABLE_META);
  if (ONLY) {
    keys = ONLY.map(keyOf).filter(Boolean);
    const bad = ONLY.filter((w) => !keyOf(w));
    if (bad.length) { console.error(`✘ --only không nhận ra: ${bad.join(", ")}`); process.exit(1); }
  }

  const result = {};
  for (const key of keys) {
    const meta = TABLE_META[key];
    const spec = SCHEMA[key];
    const found = byName.get(meta.name);

    // 1) chưa có → tạo mới kèm đủ cột
    if (!found) {
      try {
        const id = await createTable(app, key);
        result[key] = id;
        console.log(`✔ TẠO  ${meta.name}  →  ${id}  (${Object.keys(spec).length} cột)`);
      } catch (e) { console.log(`✘ TẠO  ${meta.name}: ${e.message}`); }
      continue;
    }

    // 2) đã có → chỉ bù cột thiếu
    result[key] = found;
    let names;
    try { names = new Set((await listFields(CFG, found, app)).map((f) => f.field_name)); }
    catch (e) { console.log(`✘ ĐỌC  ${meta.name} [${found}]: ${e.message}`); continue; }

    const toAdd = Object.values(spec).filter((f) => !names.has(f.name));
    if (!toAdd.length) { console.log(`= CÓ   ${meta.name}  →  ${found}  (đủ cột)`); continue; }

    process.stdout.write(`+ BÙ   ${meta.name}  →  ${found}  thêm: `);
    for (const f of toAdd) {
      try {
        await larkApi(CFG, "POST", `/open-apis/bitable/v1/apps/${app}/tables/${found}/fields`, fieldBody(f));
        process.stdout.write(`"${f.name}" `);
      } catch (e) { process.stdout.write(`\n    ✘ "${f.name}": ${e.message}\n`); }
    }
    process.stdout.write("\n");
  }

  console.log(`\n=== Dán vào config.local.json ===\n${JSON.stringify({ appToken: app, tables: result }, null, 2)}`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
