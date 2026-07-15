/**
 * check-setup.mjs — kiểm tra nhanh cấu hình trước khi chạy thật.
 * Xác nhận: token Lark OK · resolve wiki→app_token OK · 9 bảng đọc được · SMTP đăng nhập OK.
 *
 * Chạy: node scripts/check-setup.mjs
 */
import nodemailer from "nodemailer";
import { loadConfig, larkToken, resolveAppToken, listFields, loadItto, SCHEMA } from "./lib.mjs";

const CFG = loadConfig();
const ok = (b) => (b ? "✔" : "✘");

(async () => {
  console.log("== Kiểm tra cấu hình mentor-club-email-marketing ==\n");

  // 0) itto.yaml — hợp đồng ITTO (đủ 4 mục + danh sách secret)
  try {
    const itto = await loadItto();
    const miss = ["input", "tech", "tool", "output"].filter((k) => !itto[k]);
    if (miss.length) console.log(`${ok(false)} itto.yaml thiếu mục: ${miss.join(", ")}`);
    else console.log(`${ok(true)} itto.yaml — ${itto.package} v${itto.version} · đủ 4 mục I-T-T-O`);
    const secrets = itto.input?.secrets || [];
    const envMiss = secrets.filter((s) => !process.env[s]);
    console.log(`${ok(envMiss.length === 0)} Secret trong ENV: ${
      envMiss.length ? "thiếu " + envMiss.join(", ") + "  (bình thường nếu chạy máy — dùng config.local.json)" : "đủ"}`);
  } catch (e) { console.log(`${ok(false)} itto.yaml: ${e.message}`); }

  // 1) Lark token
  try { await larkToken(CFG); console.log(`${ok(true)} Lark token (app ${CFG.larkAppId})`); }
  catch (e) { console.log(`${ok(false)} Lark token: ${e.message}`); process.exit(1); }

  // 2) resolve app_token
  let app;
  try { app = await resolveAppToken(CFG); console.log(`${ok(true)} Resolve Base app_token: ${app}`); }
  catch (e) { console.log(`${ok(false)} Resolve app_token: ${e.message}\n   → Cấp quyền app trên Base + scope wiki:node:read (docs/02-cap-quyen-lark.md).`); process.exit(1); }

  // 3) 9 bảng
  let missing = 0;
  for (const [key, spec] of Object.entries(SCHEMA)) {
    const tid = CFG.tables[key];
    if (!tid) { console.log(`  ${ok(false)} ${key}: thiếu table id`); missing++; continue; }
    try {
      const fields = await listFields(CFG, tid);
      const names = new Set(fields.map((f) => f.field_name));
      const lack = Object.values(spec).filter((f) => !names.has(f.name)).map((f) => f.name);
      console.log(`  ${ok(lack.length === 0)} ${key} [${tid}] ${lack.length ? "thiếu cột: " + lack.join(", ") : "đủ cột"}`);
      if (lack.length) missing++;
    } catch (e) { console.log(`  ${ok(false)} ${key} [${tid}]: ${e.message}`); missing++; }
  }
  if (missing) console.log(`  → Chạy: node scripts/setup-tables.mjs để tạo cột còn thiếu.`);

  // 4) SMTP
  if (CFG.smtp.user && CFG.smtp.pass) {
    try {
      const t = nodemailer.createTransport({ host: CFG.smtp.host, port: CFG.smtp.port, secure: CFG.smtp.secure, auth: { user: CFG.smtp.user, pass: CFG.smtp.pass } });
      await t.verify(); console.log(`${ok(true)} SMTP đăng nhập (${CFG.smtp.user})`);
    } catch (e) { console.log(`${ok(false)} SMTP: ${e.message}\n   → Lark Mail phải dùng IMAP/SMTP password (docs/01-cau-hinh-lark-mail.md).`); }
  } else { console.log(`${ok(false)} SMTP: chưa có user/pass`); }

  // 5) tracker
  console.log(`${ok(!!CFG.tracker.baseUrl)} Tracker URL: ${CFG.tracker.baseUrl || "(chưa cấu hình — không có tracking mở/click/huỷ)"}`);

  console.log("\nXong.");
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
