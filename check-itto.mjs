#!/usr/bin/env node
/**
 * check-itto.mjs — soát hợp đồng itto.yaml. ZERO-DEPENDENCY (không cần npm install).
 * Kiểm: đủ 4 mục I-T-T-O · liệt kê secret/variable · MỌI script .mjs khai trong itto CÓ TỒN TẠI
 * (bắt lỗi bàn giao thiếu thư mục skill). Exit ≠ 0 nếu còn lỗi ⇒ cổng chốt trước khi chạy thật.
 *
 * Chạy: node check-itto.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ITTO = path.join(HERE, "itto.yaml");
const ok = (b) => (b ? "✔" : "✘");
let fail = 0;

let text;
try { text = fs.readFileSync(ITTO, "utf8"); }
catch { console.error(`✘ không đọc được itto.yaml tại ${ITTO}`); process.exit(1); }

const scalar = (key) => {
  const m = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m ? m[1].split(" #")[0].trim() : null;
};
const hasKey = (key) => new RegExp(`^\\s*${key}:`, "m").test(text);

/** Các mục "- x" ngay dưới một khoá dạng block (key:\n). */
const listUnder = (key) => {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.match(new RegExp(`^(\\s*)${key}:\\s*(#.*)?$`)));
  if (idx < 0) return [];
  const base = lines[idx].match(/^(\s*)/)[1].length;
  const out = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const ind = l.match(/^(\s*)/)[1].length;
    if (ind <= base) break;
    const m = l.match(/^\s*-\s*(.+)$/);
    if (m) out.push(m[1].split(" #")[0].trim());
  }
  return out;
};

console.log("== check-itto ==\n");

const pkg = scalar("package"), ver = scalar("version");
const skills = hasKey("skills") ? listUnder("skills") : (scalar("skill") ? [scalar("skill")] : []);
console.log(`${ok(!!pkg && !!ver)} gói: ${pkg || "?"} v${ver || "?"}`);
console.log(`${ok(skills.length > 0)} skill: ${skills.join(", ") || "(chưa khai)"}`);
if (!pkg || !ver) fail++;

const secs = ["input", "tech", "tool", "output"];
const missSec = secs.filter((s) => !new RegExp(`^${s}:`, "m").test(text));
console.log(`${ok(missSec.length === 0)} 4 mục I-T-T-O: ${missSec.length ? "THIẾU " + missSec.join(", ") : "đủ"}`);
if (missSec.length) fail++;

const secrets = listUnder("secrets");
const vars = listUnder("variables");
console.log(`${ok(secrets.length > 0)} secrets (${secrets.length}): ${secrets.join(", ")}`);
console.log(`•  variables (${vars.length}): ${vars.join(", ")}`);

const events = [...text.matchAll(/event_type:\s*(\S+)/g)].map((m) => m[1]);
console.log(`${ok(events.length > 0)} triggers (${events.length}): ${events.join(", ")}`);
if (!events.length) fail++;

// ── Mảnh ③ — Base Mẫu phải là LINK THẬT ──────────────────────────────────────
// Vì sao có luật này: 5/5 gói từng nằm im với template_url là placeholder "<...>".
// Học viên tắc ngay ở hành động ĐẦU TIÊN (bấm Duplicate) mà không gì báo động.
// Từ nay: gói chưa có Base Mẫu thật thì TỰ NÓ khai là chưa chuẩn — không cần ai nhớ.
const tplM = text.match(/^\s*template_url:\s*"?([^"\n#]+?)"?\s*(?:#.*)?$/m);
const tpl = tplM ? tplM[1].trim() : null;
const tplReal = !!tpl && !/[<>]/.test(tpl) && /^https?:\/\/\S+\/base\/\S+/.test(tpl);
console.log(`${ok(tplReal)} Base Mẫu (mảnh ③): ${tpl || "(chưa khai template_url)"}`);
if (!tplReal) {
  fail++;
  console.log("     ↳ template_url còn placeholder/không hợp lệ ⇒ học viên KHÔNG có gì để bấm ở bước 1.");
  console.log("     ↳ Sửa: dựng Base bằng lệnh ở input.base_mau.setup → bật share 'ai có link xem + tạo bản sao' → dán link thật vào đây.");
}

// Bắt MỌI đường dẫn .mjs có thư mục (.claude/…, ci/…, scripts/…) — không riêng .claude/.
// Trước đây chỉ bắt ".claude/" nên script sống còn nằm ngoài đó (vd ci/refresh-threads-token.mjs
// của gói Threads) vô hình với cổng chốt: xoá mất mà check-itto vẫn báo xanh.
const paths = [...new Set([...text.matchAll(/((?:[\w.-]+\/)+[\w.-]+\.mjs)/g)].map((m) => m[1]))];
console.log(`\nKiểm script khai trong itto (${paths.length}):`);
for (const rel of paths) {
  const exists = fs.existsSync(path.join(HERE, rel));
  console.log(`  ${ok(exists)} ${rel}`);
  if (!exists) fail++;
}

console.log(fail ? `\n✘ Còn ${fail} lỗi trong hợp đồng — sửa itto.yaml / bổ sung thư mục skill.` : `\n✔ itto.yaml hợp lệ, mọi script có mặt.`);
process.exit(fail ? 1 : 0);
