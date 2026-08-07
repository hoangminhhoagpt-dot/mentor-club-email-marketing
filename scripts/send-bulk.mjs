/**
 * send-bulk.mjs — Gửi hàng loạt qua Lark Mail, thư ĐÚNG CHUẨN, có phanh an toàn.
 *
 * Thay cho việc gửi ad-hoc từng đợt. Ba thứ script này làm mà cách gửi tay không làm được:
 *   1. THƯ ĐÚNG CHUẨN  — có Message-ID, Date, MIME-Version, cả bản chữ thuần lẫn HTML,
 *                        có header List-Unsubscribe. Thiếu mấy cái này là bị chấm điểm spam.
 *   2. NHỚ ĐÃ GỬI      — chạy lại thì gửi tiếp người còn thiếu, KHÔNG gửi trùng.
 *   3. CÓ PHANH        — bị từ chối liên tiếp N lần thì DỪNG, không bắn tiếp cả danh sách
 *                        để rồi lãnh một bức tường thư dội như hôm 28/07.
 *
 * Nhịp gửi mặc định ~4 giây/thư = ~25 thư/100 giây, bằng 12% hạn mức Lark (200 thư/100 giây).
 *
 * DÙNG:
 *   node scripts/send-bulk.mjs --list=ds.txt --mail=thu.md           # CHẠY THỬ, không gửi
 *   node scripts/send-bulk.mjs --list=ds.txt --mail=thu.md --send    # GỬI THẬT
 *
 *   Tuỳ chọn: --delay=4000  --jitter=2000  --limit=200  --stop-after=5  --from=hoaguru@...
 *
 * FILE DANH SÁCH (ds.txt) — mỗi dòng một người, dòng bắt đầu bằng # là ghi chú:
 *   an@gmail.com
 *   binh@gmail.com,Nguyễn Văn Bình
 *
 * FILE NỘI DUNG (thu.md) — tiêu đề ở đầu, thân thư bên dưới:
 *   ---
 *   subject: Tiêu đề thư, dùng được {{name}}
 *   ---
 *   Chào {{name}},
 *
 *   Thân thư viết văn bản thuần. Link cứ dán trần, script tự gắn thành liên kết.
 */
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { loadConfig, requireKeys, normEmail, sleep } from "./lib.mjs";

// ---------------------------------------------------------------------------
// THAM SỐ
// ---------------------------------------------------------------------------
const ARGS = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const CFG = loadConfig();
const SEND      = ARGS.send === true;                       // không có --send = chạy thử
const DELAY     = Number(ARGS.delay  || 4000);              // nghỉ gốc giữa 2 thư (ms)
const JITTER    = Number(ARGS.jitter || 2000);              // dao động ngẫu nhiên ± (ms)
const LIMIT     = Number(ARGS.limit  || 0) || Infinity;     // trần số thư mỗi lần chạy
const STOP_AFTER = Number(ARGS["stop-after"] || 5);         // bị từ chối liên tiếp bao nhiêu thì dừng

if (!ARGS.list || !ARGS.mail) {
  console.error("❌ Thiếu tham số. Ví dụ:\n   node scripts/send-bulk.mjs --list=ds.txt --mail=thu.md --send");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// ĐỌC DANH SÁCH & NỘI DUNG
// ---------------------------------------------------------------------------
function readList(file) {
  const out = [];
  const seen = new Set();
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [rawEmail, ...rest] = line.split(",");
    const email = normEmail(rawEmail);
    if (!email.includes("@")) { console.warn(`  ⚠️  Bỏ dòng không phải email: ${line}`); continue; }
    if (seen.has(email)) continue;                          // trùng trong file thì bỏ
    seen.add(email);
    out.push({ email, name: rest.join(",").trim() });
  }
  return out;
}

function readMail(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: thiếu khối --- ... --- chứa 'subject:' ở đầu file`);
  const subject = (m[1].match(/^subject:\s*(.+)$/m) || [])[1]?.trim();
  if (!subject) throw new Error(`${file}: không tìm thấy dòng 'subject:'`);
  const body = m[2].trim();
  if (!body) throw new Error(`${file}: thân thư rỗng`);
  return { subject, body };
}

// ---------------------------------------------------------------------------
// VĂN BẢN THUẦN → HTML + BẢN CHỮ THUẦN
// Khác bản trong email.mjs ở một điểm quan trọng: URL DÁN TRẦN CŨNG THÀNH LINK.
// (email.mjs chỉ nhận cú pháp [chữ](link), nên URL trần ra thư dưới dạng chữ chết.)
// ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s) {
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, t, u) => `<a href="${u.replace(/"/g, "%22")}">${t}</a>`);
  // URL trần chưa nằm trong thẻ <a> → tự gắn link
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    (_, pre, u) => `${pre}<a href="${u.replace(/"/g, "%22")}">${u}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<i>$2</i>");
  return s;
}

function toHtml(body) {
  const blocks = [];
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split("\n");
    let i = 0;
    while (i < lines.length) {
      if (/^\s*[-*]\s+/.test(lines[i])) {
        const li = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]))
          li.push(`<li>${inline(esc(lines[i++].replace(/^\s*[-*]\s+/, "")))}</li>`);
        blocks.push(`<ul>${li.join("")}</ul>`);
      } else if (/^\s*\d+[.)]\s+/.test(lines[i])) {
        const li = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]))
          li.push(`<li>${inline(esc(lines[i++].replace(/^\s*\d+[.)]\s+/, "")))}</li>`);
        blocks.push(`<ol>${li.join("")}</ol>`);
      } else {
        const p = [];
        while (i < lines.length && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i]))
          p.push(inline(esc(lines[i++])));
        blocks.push(`<p>${p.join("<br>")}</p>`);
      }
    }
  }
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;`
       + `font-size:15px;line-height:1.6;color:#222">${blocks.join("\n")}</body></html>`;
}

/** Bản chữ thuần — KHÔNG phải bỏ thẻ HTML, mà dựng lại từ nội dung gốc cho người đọc. */
function toText(body) {
  return body
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2")   // link → "chữ: url"
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1$2")
    .trim();
}

const render = (tpl, vars) =>
  String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));

// ---------------------------------------------------------------------------
// SỔ ĐÃ GỬI — chạy lại KHÔNG gửi trùng
// ---------------------------------------------------------------------------
const stateFile = path.join(
  path.dirname(path.resolve(ARGS.mail)),
  `.da-gui-${path.basename(ARGS.mail).replace(/\W+/g, "-")}.json`
);
const loadState = () => {
  try { return new Set(JSON.parse(fs.readFileSync(stateFile, "utf8"))); } catch { return new Set(); }
};
const saveState = (set) => fs.writeFileSync(stateFile, JSON.stringify([...set], null, 0), "utf8");

/** Lark từ chối vì bộ lọc rác — KHÔNG phải địa chỉ hỏng, tuyệt đối đừng coi là hard bounce. */
const isAntispam = (msg) => /\b912\b|antispam|suspected to be spam/i.test(String(msg));

// ---------------------------------------------------------------------------
// CHẠY
// ---------------------------------------------------------------------------
(async () => {
  requireKeys(CFG, ["smtp.host", "smtp.user", "smtp.pass"]);

  const list = readList(ARGS.list);
  const mail = readMail(ARGS.mail);
  const sentBefore = loadState();
  const queue = list.filter((r) => !sentBefore.has(r.email)).slice(0, LIMIT);

  const fromEmail = String(ARGS.from || CFG.smtp.fromEmail || CFG.smtp.user);
  const fromName = String(ARGS.fromName || CFG.smtp.fromName || "");

  console.log(`\n📋 Danh sách   : ${list.length} người (đã gửi trước đó: ${sentBefore.size})`);
  console.log(`📨 Sẽ gửi lần này: ${queue.length}`);
  console.log(`✉️  Tiêu đề     : ${mail.subject}`);
  console.log(`👤 Người gửi   : ${fromName} <${fromEmail}>`);
  console.log(`⏱️  Nhịp        : ${DELAY}ms ± ${JITTER}ms  (~${Math.round(100000 / DELAY)} thư/100 giây, hạn mức Lark 200)`);
  console.log(`🛑 Phanh       : dừng sau ${STOP_AFTER} lần bị từ chối liên tiếp`);
  console.log(SEND ? "🔴 CHẾ ĐỘ GỬI THẬT\n" : "🟢 CHẠY THỬ — không gửi thư nào. Thêm --send để gửi thật.\n");

  if (!queue.length) { console.log("Không còn ai để gửi."); return; }

  if (!SEND) {                                            // chạy thử: in thư mẫu rồi thoát
    const v = { name: queue[0].name || "bạn", email: queue[0].email };
    console.log("── Thư mẫu gửi cho " + queue[0].email + " ──");
    console.log("Tiêu đề: " + render(mail.subject, v));
    console.log(render(toText(mail.body), v));
    console.log("──────────────\nNgười nhận: " + queue.map((r) => r.email).join(", "));
    return;
  }

  const transport = nodemailer.createTransport({
    host: CFG.smtp.host, port: CFG.smtp.port, secure: CFG.smtp.secure,
    auth: { user: CFG.smtp.user, pass: CFG.smtp.pass },
    pool: true, maxConnections: 1, maxMessages: 20,       // nối lại định kỳ, tránh kết nối ôi
  });

  let ok = 0, err = 0, streak = 0;
  const failures = [];

  for (let i = 0; i < queue.length; i++) {
    const r = queue[i];
    const vars = { name: r.name || "bạn", email: r.email };
    try {
      await transport.sendMail({
        from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
        to: r.email,
        subject: render(mail.subject, vars),
        text: render(toText(mail.body), vars),           // BẢN CHỮ THUẦN — thiếu là bị chấm điểm spam
        html: render(toHtml(mail.body), vars),
        headers: {
          // Huỷ nhận bằng cách trả lời thư, đúng cách đang vận hành. Nhà mạng đọc được header này.
          "List-Unsubscribe": `<mailto:${fromEmail}?subject=ngung-nhan>`,
        },
      });
      ok++; streak = 0;
      sentBefore.add(r.email); saveState(sentBefore);     // ghi ngay từng người, đứt gánh không mất dấu
      console.log(`  ✔ ${String(i + 1).padStart(4)}/${queue.length}  ${r.email}`);
    } catch (e) {
      err++; streak++;
      const msg = e.message || String(e);
      failures.push({ email: r.email, antispam: isAntispam(msg), error: msg });
      console.log(`  ✘ ${String(i + 1).padStart(4)}/${queue.length}  ${r.email}  →  ${msg}`);

      if (streak >= STOP_AFTER) {
        console.log(`\n🛑 DỪNG: ${streak} lần bị từ chối liên tiếp. Không bắn tiếp để khỏi lãnh cả bức tường thư dội.`);
        break;
      }
    }
    if (i < queue.length - 1) {
      await sleep(Math.max(500, DELAY + Math.round((Math.random() * 2 - 1) * JITTER)));
    }
  }

  transport.close?.();

  console.log(`\n✅ Xong: gửi được ${ok} · lỗi ${err} · còn lại ${list.length - sentBefore.size} người chưa gửi.`);
  if (failures.length) {
    const spam = failures.filter((f) => f.antispam);
    if (spam.length) {
      console.log(`\n⚠️  ${spam.length} thư bị BỘ LỌC LARK TỪ CHỐI (mã 912). Đây KHÔNG phải địa chỉ hỏng —`);
      console.log(`   tuyệt đối đừng đưa vào danh sách mail lỗi. Chạy lại script sẽ tự gửi tiếp cho họ.`);
    }
    const logFile = stateFile.replace(/^\.da-gui-/, ".loi-").replace(/\.json$/, ".json");
    fs.writeFileSync(path.join(path.dirname(stateFile), path.basename(logFile)),
      JSON.stringify(failures, null, 2), "utf8");
    console.log(`   Nhật ký lỗi: ${path.basename(logFile)}`);
  }
  console.log(`   Sổ đã gửi  : ${path.basename(stateFile)}  (xoá file này nếu muốn gửi lại từ đầu)\n`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
