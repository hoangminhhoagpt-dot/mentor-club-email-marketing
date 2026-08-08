/**
 * doi-hop-gui.mjs — đổi đường gửi thư sang nhà cung cấp khác.
 *
 * Hệ gửi qua SMTP tiêu chuẩn nên đổi nhà cung cấp KHÔNG cần sửa dòng code nào — chỉ đổi
 * thông số đăng nhập. Nhưng thông số nằm ở HAI nơi: `config.local.json` (chạy tại máy) và
 * GitHub Variables/Secrets (Actions chạy thật). Sửa một nơi quên nơi kia là thư vẫn đi
 * đường cũ mà không ai biết — script này đổi cả hai rồi thử đăng nhập luôn.
 *
 * Dùng:
 *   node scripts/doi-hop-gui.mjs --host smtp.resend.com --port 465 \
 *        --user resend --pass "<khoá>" --from tin@mentorcamp.io.vn --ten "Tên hiện ra"
 *
 *   node scripts/doi-hop-gui.mjs --xem            # chỉ xem đang dùng gì
 *   node scripts/doi-hop-gui.mjs ... --chi-may    # không đụng GitHub
 *
 * KHÔNG bao giờ in mật khẩu ra màn hình.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import nodemailer from "nodemailer";
import { DEFAULT_CONFIG } from "./lib.mjs";

const co = (ten, mac) => {
  const i = process.argv.indexOf(`--${ten}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : mac;
};
const cờ = (ten) => process.argv.includes(`--${ten}`);

const CFG = JSON.parse(fs.readFileSync(DEFAULT_CONFIG, "utf8"));

if (cờ("xem") || !co("host")) {
  const s = CFG.smtp || {};
  console.log("Đường gửi hiện tại:");
  console.log(`   máy chủ : ${s.host}:${s.port}`);
  console.log(`   đăng nhập: ${s.user}`);
  console.log(`   hiện ra  : "${s.fromName}" <${s.from || s.user}>`);
  console.log(`   mật khẩu : ${s.pass ? "[đã có, " + String(s.pass).length + " ký tự]" : "[trống]"}`);
  if (!co("host")) console.log("\n(Thiếu --host nên chỉ xem. Xem cách dùng ở đầu file này.)");
  process.exit(0);
}

const moi = {
  host: co("host"), port: Number(co("port", 465)),
  user: co("user"), pass: co("pass"),
  from: co("from", CFG.smtp?.from || CFG.smtp?.user),
  fromName: co("ten", CFG.smtp?.fromName || "Hoàng Minh Hoá Và Cộng Sự"),
};
if (!moi.user || !moi.pass) { console.error("Thiếu --user hoặc --pass"); process.exit(1); }

// ── 1. Thử đăng nhập TRƯỚC khi ghi gì ────────────────────────────────────────
process.stdout.write("① Thử đăng nhập máy chủ mới... ");
try {
  await nodemailer.createTransport({
    host: moi.host, port: moi.port, secure: moi.port === 465,
    auth: { user: moi.user, pass: moi.pass },
  }).verify();
  console.log("được");
} catch (e) {
  console.log("KHÔNG được\n   " + e.message);
  console.log("\nDừng lại, chưa đổi gì cả. Kiểm lại máy chủ / khoá rồi chạy lại.");
  process.exit(1);
}

// ── 2. Ghi vào cấu hình máy (giữ bản cũ để quay lại được) ────────────────────
const luu = DEFAULT_CONFIG + ".bak-" + new Date().toISOString().slice(0, 10);
fs.copyFileSync(DEFAULT_CONFIG, luu);
CFG.smtp = { ...CFG.smtp, ...moi };
if (CFG.imap && co("imap-user")) CFG.imap.user = co("imap-user");
fs.writeFileSync(DEFAULT_CONFIG, JSON.stringify(CFG, null, 2) + "\n");
console.log(`② Đã ghi cấu hình máy (bản cũ giữ ở ${path.basename(luu)})`);

// ── 3. Đẩy lên GitHub ────────────────────────────────────────────────────────
if (cờ("chi-may")) { console.log("③ Bỏ qua GitHub theo yêu cầu."); process.exit(0); }

let pat;
try {
  pat = (/^password=(.+)$/m.exec(execFileSync("git",
    ["-c", "credential.helper=wincred", "credential", "fill"],
    { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" })) || [])[1]?.trim();
} catch {}
if (!pat) {
  console.log("③ Không đọc được thông tin đăng nhập GitHub — hãy tự đặt:");
  console.log(`   Variables: SMTP_HOST=${moi.host} · SMTP_PORT=${moi.port} · SMTP_USER=${moi.user}`);
  console.log(`              SMTP_FROM_EMAIL=${moi.from} · SMTP_FROM_NAME=${moi.fromName}`);
  console.log("   Secret   : SMTP_PASS = <khoá vừa dùng>");
  process.exit(0);
}

const REPO = process.env.REPO || "hoangminhhoagpt-dot/mentor-club-email-marketing";
const H = { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json", "User-Agent": "mc", "Content-Type": "application/json" };

async function datBien(ten, gia) {
  const co = await fetch(`https://api.github.com/repos/${REPO}/actions/variables/${ten}`, { headers: H });
  const r = co.ok
    ? await fetch(`https://api.github.com/repos/${REPO}/actions/variables/${ten}`,
        { method: "PATCH", headers: H, body: JSON.stringify({ name: ten, value: String(gia) }) })
    : await fetch(`https://api.github.com/repos/${REPO}/actions/variables`,
        { method: "POST", headers: H, body: JSON.stringify({ name: ten, value: String(gia) }) });
  console.log(`   ${r.ok ? "✔" : "✘"} ${ten}`);
}
for (const [k, v] of [["SMTP_HOST", moi.host], ["SMTP_PORT", moi.port], ["SMTP_USER", moi.user],
                      ["SMTP_FROM_EMAIL", moi.from], ["SMTP_FROM_NAME", moi.fromName]]) await datBien(k, v);

// Secret phải mã hoá bằng khoá công khai của kho (libsodium sealed box)
try {
  const pk = await (await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, { headers: H })).json();
  const sodium = await import("libsodium-wrappers");
  await sodium.default.ready;
  const kin = sodium.default.crypto_box_seal(
    sodium.default.from_string(moi.pass), sodium.default.from_base64(pk.key, sodium.default.base64_variants.ORIGINAL));
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/SMTP_PASS`, {
    method: "PUT", headers: H,
    body: JSON.stringify({ encrypted_value: sodium.default.to_base64(kin, sodium.default.base64_variants.ORIGINAL), key_id: pk.key_id }),
  });
  console.log(`   ${r.ok ? "✔" : "✘"} SMTP_PASS (khoá bí mật)`);
} catch (e) {
  console.log(`   ✘ SMTP_PASS — ${e.message}`);
  console.log("     Tự đặt trong Settings → Secrets → Actions → SMTP_PASS");
}

console.log("\n✅ Xong. Chạy `npm run kiem-thu` rồi gửi thử một thư trước khi chạy chiến dịch thật.");
