/**
 * phan-tich-bounce.mjs — TRẢ LỜI CÂU HỎI "VÌ SAO BỊ CHẶN" BẰNG SỐ, KHÔNG ĐOÁN.
 *
 * Đọc hộp thư qua IMAP, gom TẤT CẢ thư dội của Lark trong N ngày, rồi lập bảng:
 *
 *      Bài nào bị chặn · bao nhiêu người · vào giờ nào
 *      Đối chiếu với thư trong hòm ĐÃ GỬI để ra TỶ LỆ BỊ CHẶN của từng bài.
 *
 * Đọc xong bảng là biết ngay nguyên nhân thuộc loại nào:
 *
 *   • Vài bài bị chặn ~100%, các bài khác ~0%   → do NỘI DUNG từng bài.
 *     Nhìn tiêu đề nhóm bị chặn là thấy điểm chung.
 *   • Mọi bài đều bị chặn rải rác ~20-40%        → KHÔNG phải nội dung.
 *     Là ngưỡng/uy tín hòm thư → xem cột giờ.
 *   • Bị chặn dồn vào một khung giờ, bài nào     → là HẠN MỨC theo thời gian.
 *     rơi vào khung đó cũng dính
 *
 * CHỈ ĐỌC — không gửi, không sửa, không ghi gì lên Lark Base.
 *
 * Chạy:  node scripts/phan-tich-bounce.mjs
 *        DAYS=30 node scripts/phan-tich-bounce.mjs
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { loadConfig, requireKeys, normEmail } from "./lib.mjs";

const CFG = loadConfig();
const DAYS = Number(process.env.DAYS || 14);
const DAY_MS = 86400000;

const pad = (s, n) => String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s).padEnd(n);
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const ngay = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Bóc tiêu đề bài bị trả về từ thân thư dội của Lark. */
function bocTieuDe(text) {
  const m = String(text).match(/Failed to send\s+"([^"]+)"/i)
        || String(text).match(/Failed to send\s+“([^”]+)”/i)
        || String(text).match(/gửi thất bại[:\s]+"([^"]+)"/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : "(không đọc được tiêu đề)";
}

/** Bóc địa chỉ người nhận bị trả về. */
function bocNguoiNhan(text) {
  const s = String(text);
  const m = s.match(/Final-Recipient:\s*rfc822;\s*<?([^\s<>;"]+@[^\s<>;"]+)>?/i)
        || s.match(/Recipient[\s|]*[:|]?\s*<?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>?/i)
        || s.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return m ? normEmail(m[1]) : "";
}

const laDoLocRac = (t) => /\b912\b|antispam|suspected to be spam/i.test(String(t));

/** Tìm tên hòm ĐÃ GỬI (mỗi nơi đặt một kiểu). */
async function timHomDaGui(client) {
  try {
    for (const box of await client.list()) {
      const p = String(box.path);
      if (/^sent$|sent[ -]?(mail|items|messages)|\bĐã gửi\b|已发送/i.test(p)) return p;
      if (box.specialUse === "\\Sent") return p;
    }
  } catch { /* bỏ qua */ }
  return null;
}

(async () => {
  requireKeys(CFG, ["imap.host", "imap.user", "imap.pass"]);
  const since = new Date(Date.now() - DAYS * DAY_MS);

  const client = new ImapFlow({
    host: CFG.imap.host, port: CFG.imap.port, secure: true,
    auth: { user: CFG.imap.user, pass: CFG.imap.pass }, logger: false,
  });
  await client.connect();

  // ---------- 1) Gom thư dội ----------
  const doi = [];
  let lock = await client.getMailboxLock("INBOX");
  try {
    let uids = [];
    for (const from of ["mailer-daemon", "postmaster"]) {
      try {
        const found = await client.search({ from, since }, { uid: true });
        if (found?.length) uids = uids.concat(found);
      } catch { /* bỏ qua */ }
    }
    uids = [...new Set(uids)];
    console.log(`\n🔎 Quét ${DAYS} ngày gần nhất — thấy ${uids.length} thư dội. Đang đọc...`);

    for (const uid of uids) {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!msg?.source) continue;
      const p = await simpleParser(msg.source);
      const noiDung = [p.text || "", p.html || "", p.subject || ""].join("\n");
      doi.push({
        tieuDe: bocTieuDe(noiDung),
        nguoiNhan: bocNguoiNhan(noiDung),
        luc: p.date || new Date(),
        locRac: laDoLocRac(noiDung),
      });
    }
  } finally { lock.release(); }

  if (!doi.length) { console.log("Không có thư dội nào trong khoảng này."); await client.logout(); return; }

  // ---------- 2) Đếm số đã gửi mỗi bài (nếu đọc được hòm Đã gửi) ----------
  const daGui = new Map();
  const homDaGui = await timHomDaGui(client);
  if (homDaGui) {
    lock = await client.getMailboxLock(homDaGui);
    try {
      const uids = await client.search({ since }, { uid: true });
      for (const uid of (uids || [])) {
        const msg = await client.fetchOne(uid, { envelope: true }, { uid: true });
        const s = msg?.envelope?.subject?.replace(/\s+/g, " ").trim();
        if (s) daGui.set(s, (daGui.get(s) || 0) + 1);
      }
      console.log(`📤 Hòm đã gửi "${homDaGui}": ${[...daGui.values()].reduce((a, b) => a + b, 0)} thư.`);
    } finally { lock.release(); }
  } else {
    console.log("⚠️  Không tìm thấy hòm Đã gửi → chỉ thống kê được số bị chặn, không ra tỷ lệ.");
  }
  await client.logout();

  // ---------- 3) Lập bảng theo BÀI ----------
  const theoBai = new Map();
  for (const b of doi) {
    const g = theoBai.get(b.tieuDe) || { chan: 0, locRac: 0, ai: new Set(), som: b.luc, muon: b.luc };
    g.chan++; if (b.locRac) g.locRac++;
    if (b.nguoiNhan) g.ai.add(b.nguoiNhan);
    if (b.luc < g.som) g.som = b.luc;
    if (b.luc > g.muon) g.muon = b.luc;
    theoBai.set(b.tieuDe, g);
  }

  console.log(`\n${"═".repeat(108)}`);
  console.log("BỊ CHẶN THEO TỪNG BÀI  (sắp theo số bị chặn)");
  console.log("═".repeat(108));
  console.log(`${pad("TIÊU ĐỀ BÀI", 56)} ${pad("CHẶN", 6)} ${pad("ĐÃ GỬI", 8)} ${pad("TỶ LỆ", 8)} ${pad("KHUNG GIỜ", 22)}`);
  console.log("─".repeat(108));

  const rows = [...theoBai.entries()].sort((a, b) => b[1].chan - a[1].chan);
  for (const [tieuDe, g] of rows) {
    const guiDi = daGui.get(tieuDe) || 0;
    const tyLe = guiDi ? `${Math.round((g.chan / guiDi) * 100)}%` : "—";
    const gio = `${ngay(g.som)} ${hhmm(g.som)}–${hhmm(g.muon)}`;
    console.log(`${pad(tieuDe, 56)} ${pad(g.chan, 6)} ${pad(guiDi || "—", 8)} ${pad(tyLe, 8)} ${pad(gio, 22)}`);
  }

  // ---------- 4) Bài GỬI ĐƯỢC, không dính thư dội nào ----------
  const sach = [...daGui.keys()].filter((s) => !theoBai.has(s));
  if (sach.length) {
    console.log(`\n${"─".repeat(108)}`);
    console.log(`✅ ${sach.length} bài KHÔNG bị chặn lần nào — so tiêu đề với nhóm trên để tìm điểm khác biệt:`);
    for (const s of sach.slice(0, 25)) console.log(`   · ${s}   (${daGui.get(s)} thư)`);
  }

  // ---------- 5) Bị chặn theo GIỜ ----------
  const theoGio = new Map();
  for (const b of doi) {
    const k = `${ngay(b.luc)} ${String(b.luc.getHours()).padStart(2, "0")}h`;
    theoGio.set(k, (theoGio.get(k) || 0) + 1);
  }
  console.log(`\n${"─".repeat(108)}`);
  console.log("BỊ CHẶN THEO GIỜ  (dồn cục = nghi hạn mức · rải đều = nghi nội dung)");
  for (const [k, v] of [...theoGio.entries()].sort()) {
    console.log(`   ${k}  ${"█".repeat(Math.min(60, v))} ${v}`);
  }

  // ---------- 6) Kết ----------
  const tongChan = doi.length;
  const tongLoc = doi.filter((b) => b.locRac).length;
  const soNguoi = new Set(doi.map((b) => b.nguoiNhan).filter(Boolean)).size;
  console.log(`\n${"═".repeat(108)}`);
  console.log(`TỔNG: ${tongChan} thư bị dội · ${tongLoc} do bộ lọc rác (912) · ảnh hưởng ${soNguoi} người · ${rows.length} bài`);
  if (daGui.size) {
    const tongGui = [...daGui.values()].reduce((a, b) => a + b, 0);
    console.log(`Tỷ lệ bị chặn chung: ${Math.round((tongChan / tongGui) * 100)}% (${tongChan}/${tongGui})`);
  }
  console.log(`\n👉 ĐỌC BẢNG:`);
  console.log(`   Vài bài ~100%, còn lại ~0%  → do NỘI DUNG bài đó. Soi tiêu đề nhóm bị chặn.`);
  console.log(`   Mọi bài đều rải rác 20-40%  → KHÔNG phải nội dung. Là ngưỡng/uy tín hòm thư.`);
  console.log(`   Dồn vào một khung giờ       → là HẠN MỨC theo thời gian.\n`);
  console.log(`⚠️  ${soNguoi} người trong danh sách này KHÔNG phải mail hỏng — đừng để bị chặn vĩnh viễn.\n`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
