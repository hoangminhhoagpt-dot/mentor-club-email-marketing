/**
 * kiem-thu-he-thong.mjs — chạy thử TOÀN BỘ đường đi của hệ, bằng dữ liệu thật, rồi dọn sạch.
 *
 * Khác `check-setup.mjs` ở chỗ: check-setup chỉ hỏi "có đủ cột chưa", còn cái này hỏi
 * "bấm vào thì có chạy không" — bắn thật vào Worker, đợi Lark ghi, đọc lại từng ô xem
 * số có nhảy đúng không, kể cả các cột công thức tra cứu chéo bảng.
 *
 * KHÔNG gửi email cho ai. Mọi dòng tạo ra đều mang địa chỉ kiểm thử và bị xoá ở cuối,
 * kể cả khi giữa chừng có phép thử hỏng.
 *
 * Chạy: node scripts/kiem-thu-he-thong.mjs
 *       node scripts/kiem-thu-he-thong.mjs --giu    (giữ lại dữ liệu thử để soi bằng mắt)
 */
import {
  loadConfig, requireKeys, listAllRecords, createRecord, larkApi, resolveAppToken,
  encodeToken, F, sleep, nowMs,
} from "./lib.mjs";

const CFG = loadConfig();
const GIU = process.argv.includes("--giu");
const EMAIL = "kiem-thu-he-thong@mentorcamp.io.vn";
const TEN = "NGƯỜI KIỂM THỬ (xoá được)";
const UA_THAT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const UA_QUET = "Proofpoint-Scanner/1.0";

let dat = 0, hong = 0;
const ket = [];
function cham(ten, ok, ghi = "") {
  ket.push({ ten, ok, ghi });
  if (ok) dat++; else hong++;
  console.log(`  ${ok ? "✔" : "✘"} ${ten}${ghi ? "  — " + ghi : ""}`);
}

// Ô công thức Lark trả về dạng {type, value:[{text}]} chứ không phải chuỗi trần.
// Riêng cột SỐ TỰ TĂNG khi tra cứu về thì trả {number, sequence} — không có khoá `text`,
// đọc nhầm là tưởng ô rỗng và báo hỏng oan.
const oChu = (x) => (x && typeof x === "object" ? (x.text ?? x.number ?? x.name ?? "") : x);
function chu(v) {
  if (v == null) return "";
  if (typeof v === "object" && !Array.isArray(v) && Array.isArray(v.value)) return v.value.map(oChu).join(", ");
  if (Array.isArray(v)) return v.map(oChu).join(", ");
  if (typeof v === "object") return v.text ?? v.number ?? String(v.value ?? "");
  return String(v);
}
const so = (v) => { const n = Number(chu(v).replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : 0; };

// Dọn theo DẤU HIỆU (địa chỉ kiểm thử nằm đâu đó trong dòng), không theo danh sách id thu
// thập dọc đường — giữa chừng văng lỗi thì danh sách đó thiếu, mà rác vẫn phải sạch.
// Và tuyệt đối KHÔNG nuốt lỗi: dọn hụt mà im lặng thì lần chạy sau đọc nhầm dòng cũ,
// phép thử báo hỏng oan (đúng cái bẫy đã dính một lần).
async function xoaRac(tableId) {
  const app = await resolveAppToken(CFG);
  const ds = await listAllRecords(CFG, tableId);
  const rac = ds.filter((r) => JSON.stringify(r.fields || {}).includes(EMAIL));
  let xong = 0;
  for (const r of rac) {
    try {
      await larkApi(CFG, "DELETE", `/open-apis/bitable/v1/apps/${app}/tables/${tableId}/records/${r.record_id}`);
      xong++;
    } catch (e) { console.log(`   ✘ không xoá được ${r.record_id}: ${e.message}`); }
  }
  return { thay: rac.length, xong };
}
async function timTheoEmail(tableId, cotEmail) {
  const ds = await listAllRecords(CFG, tableId);
  return ds.filter((r) => chu(r.fields?.[cotEmail]).toLowerCase() === EMAIL);
}

// Worker cần vài giây để ghi xong, và cột công thức tính lại cũng không tức thì.
async function doiCho(mo, lan = 12, nghi = 2500) {
  for (let i = 0; i < lan; i++) {
    const r = await mo();
    if (r) return r;
    await sleep(nghi);
  }
  return null;
}

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret", "tables.nurtureList", "tracker.baseUrl"]);
  const BASE = String(CFG.tracker.baseUrl).replace(/\/+$/, "");
  const T = CFG.tables;
  const don = { [T.nurtureList]: [], [T.openReport]: [], [T.clickList]: [], [T.unsubscribe]: [] };

  console.log("== Kiểm thử hệ Email Marketing ==");
  console.log(`   Base: ${await resolveAppToken(CFG)}`);
  console.log(`   Worker: ${BASE}`);
  console.log(`   Địa chỉ dùng để thử: ${EMAIL}\n`);

  try {
    // ── 0. Code chạy thật có phải code mình đang sửa không ───────────────────
    // Actions chạy code trên GitHub, KHÔNG phải file trong máy. Từng có bản vá nằm
    // trong thư mục làm việc mà không nằm trong commit nào ⇒ chạy thử ở máy thì xanh,
    // còn thư thật do Actions gửi vẫn dùng code cũ. Phải đối chiếu trước mọi thứ khác.
    console.log("⓪ Code trong máy và code trên GitHub");
    try {
      const { execFileSync } = await import("node:child_process");
      const g = (args) => execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" }).trim();
      const ban = g(["status", "--porcelain"]).split("\n").filter((l) => /\.(mjs|js|json|yml)$/.test(l));
      cham("không còn thay đổi chưa commit", ban.length === 0,
        ban.length ? ban.map((l) => l.trim()).join(" · ") : "");
      try { execFileSync("git", ["fetch", "-q", "origin"], { cwd: process.cwd() }); } catch {}
      const cuc = g(["rev-parse", "HEAD"]), xa = g(["rev-parse", "origin/main"]);
      cham("commit trong máy trùng commit trên GitHub", cuc === xa,
        cuc === xa ? cuc.slice(0, 7) : `máy ${cuc.slice(0, 7)} ≠ GitHub ${xa.slice(0, 7)}`);
    } catch (e) { cham("đối chiếu được với GitHub", false, e.message.split("\n")[0]); }

    // ── 0b. Thay biến trong thư ─────────────────────────────────────────────
    const { renderTemplate } = await import("./email.mjs");
    const v = { name: "Anh Hoá", customer_name: "Anh Hoá" };
    cham("thay được {{name}} (kiểu cũ)", renderTemplate("{{name}} thân mến", v) === "Anh Hoá thân mến");
    cham("thay được {customer_name} (kiểu Lark)",
      renderTemplate("{customer_name} thân mến", v) === "Anh Hoá thân mến");
    cham("không đụng CSS trong thư HTML",
      renderTemplate("a{color:red}", v) === "a{color:red}");

    // ── 1. Dựng một người nhận giả trong 12.1 ───────────────────────────────
    console.log("\n① Dựng dữ liệu thử");
    const hn = new Date(); hn.setHours(0, 0, 0, 0);
    const nguoi = await createRecord(CFG, T.nurtureList, {
      [F(CFG, "nurtureList", "email")]: EMAIL,
      [F(CFG, "nurtureList", "name")]: TEN,
      [F(CFG, "nurtureList", "startDate")]: hn.getTime() - 86400000,   // bắt đầu từ hôm qua
      [F(CFG, "nurtureList", "status")]: "Tạm dừng",                   // KHÔNG để "Đang nuôi" kẻo bị gửi thật
      [F(CFG, "nurtureList", "lastStep")]: 2,
    });
    don[T.nurtureList].push(nguoi.record_id);
    cham("tạo được người nhận thử trong 12.1", !!nguoi.record_id);

    // Lấy một bản tin có thật ở 12.4 để thử đường bản tin
    const dsBanTin = await listAllRecords(CFG, T.newsletterMail);
    const banTin = dsBanTin[0];
    const tieuDeBanTin = chu(banTin?.fields?.[F(CFG, "newsletterMail", "subject")]);
    cham("có bản tin trong 12.4 để bám vào", !!tieuDeBanTin, tieuDeBanTin.slice(0, 50));

    // ── 2. Bộ lọc máy quét ──────────────────────────────────────────────────
    console.log("\n② Bộ lọc máy quét (đừng đếm nhầm lượt mở)");
    const tokQuet = encodeToken({ e: EMAIL, c: "Kiểm thử máy quét", s: "Ngày 1" });
    const rq = await fetch(`${BASE}/o?t=${tokQuet}`, { headers: { "User-Agent": UA_QUET } });
    cham("máy quét vẫn nhận được ảnh (không làm hỏng thư)", rq.ok, `HTTP ${rq.status}`);
    await sleep(4000);
    const dongQuet = (await timTheoEmail(T.openReport, F(CFG, "openReport", "email")))
      .filter((r) => chu(r.fields?.[F(CFG, "openReport", "campaign")]) === "Kiểm thử máy quét");
    don[T.openReport].push(...dongQuet.map((r) => r.record_id));
    cham("KHÔNG ghi lượt mở của máy quét vào 12.5", dongQuet.length === 0,
      dongQuet.length ? `ghi nhầm ${dongQuet.length} dòng` : "");

    // ── 3. Lượt mở thật — đường BẢN TIN ─────────────────────────────────────
    console.log("\n③ Mở thư bản tin → 12.5 và các cột tra cứu");
    const cd = `Bảng tin: ${tieuDeBanTin}`.slice(0, 100);
    const tokMo = encodeToken({ e: EMAIL, c: cd, s: "" });
    const rm = await fetch(`${BASE}/o?t=${tokMo}`, { headers: { "User-Agent": UA_THAT } });
    cham("Worker trả pixel", rm.ok, `HTTP ${rm.status}`);

    const dongMo = await doiCho(async () => {
      const ds = (await timTheoEmail(T.openReport, F(CFG, "openReport", "email")))
        .filter((r) => chu(r.fields?.[F(CFG, "openReport", "campaign")]) === cd);
      return ds[0] || null;
    });
    if (dongMo) don[T.openReport].push(dongMo.record_id);
    cham("12.5 ghi được lượt mở", !!dongMo);

    if (dongMo) {
      // đọc lại để cột công thức kịp tính
      await sleep(3000);
      const lai = (await listAllRecords(CFG, T.openReport)).find((r) => r.record_id === dongMo.record_id);
      cham("12.5 · Họ và Tên tra được từ 12.1", chu(lai?.fields?.["Họ và Tên"]).includes("KIỂM THỬ"),
        chu(lai?.fields?.["Họ và Tên"]));
      cham("12.5 · Tiêu đề tra được từ 12.4", !!chu(lai?.fields?.["Tiêu đề"]),
        chu(lai?.fields?.["Tiêu đề"]).slice(0, 40));
      cham("12.5 · ID tra được mã bản tin", !!chu(lai?.fields?.["ID"]), chu(lai?.fields?.["ID"]));
    }

    // ── 4. Số liệu dội ngược về 12.4 ────────────────────────────────────────
    console.log("\n④ Số liệu dội ngược về 12.4 Email bảng tin");
    await sleep(3000);
    const bt = (await listAllRecords(CFG, T.newsletterMail)).find((r) => r.record_id === banTin.record_id);
    const soLan = so(bt?.fields?.["Số lần mở mail"]);
    const soNguoi = so(bt?.fields?.["Số người mở mail"]);
    cham("12.4 · Số lần mở mail đếm được", soLan >= 1, `= ${soLan}`);
    cham("12.4 · Số người mở mail đếm được", soNguoi >= 1, `= ${soNguoi}`);
    cham("12.4 · Tỉ lệ mở mail tính ra số", chu(bt?.fields?.["Tỉ lệ mở mail"]) !== "",
      `= ${chu(bt?.fields?.["Tỉ lệ mở mail"])}%`);

    // ── 5. Lượt mở thật — đường NUÔI DƯỠNG ──────────────────────────────────
    console.log("\n⑤ Mở thư nuôi dưỡng → 12.1 và 12.2");
    const tokND = encodeToken({ e: EMAIL, c: CFG.nurture?.campaignName || "Nuôi dưỡng 365", s: "Ngày 2" });
    await fetch(`${BASE}/o?t=${tokND}`, { headers: { "User-Agent": UA_THAT } });

    const daDanh = await doiCho(async () => {
      const r = (await listAllRecords(CFG, T.nurtureList)).find((x) => x.record_id === nguoi.record_id);
      // "Tỉ lệ mở mail" là cột Worker tự đánh dấu, không khai trong SCHEMA nên gọi thẳng tên
      return chu(r?.fields?.["Tỉ lệ mở mail"]).includes("Day 2") ? r : null;
    });
    cham("12.1 · Tỉ lệ mở mail được đánh dấu 'Day 2'", !!daDanh,
      daDanh ? chu(daDanh.fields?.["Tỉ lệ mở mail"]) : "chưa thấy");
    if (daDanh) cham("12.1 · Thời gian mở mail có dấu thời gian", !!daDanh.fields?.["Thời gian mở mail"]);

    // dòng 12.5 của nhánh nuôi dưỡng cũng phải dọn
    const dongND = (await timTheoEmail(T.openReport, F(CFG, "openReport", "email")))
      .filter((r) => chu(r.fields?.[F(CFG, "openReport", "step")]) === "Ngày 2");
    don[T.openReport].push(...dongND.map((r) => r.record_id));

    await sleep(3000);
    const ngay2 = (await listAllRecords(CFG, T.campaign365))
      .find((r) => so(r.fields?.[F(CFG, "campaign365", "day")]) === 2);
    cham("12.2 · Số người đọc Email của Ngày 2 đếm được", so(ngay2?.fields?.["Số người đọc Email"]) >= 1,
      `= ${so(ngay2?.fields?.["Số người đọc Email"])}`);

    // ── 6. Bấm link ─────────────────────────────────────────────────────────
    console.log("\n⑥ Bấm link → 12.9");
    const dich = "https://mentorcamp.io.vn/";
    const rc = await fetch(`${BASE}/c?t=${tokMo}&u=${Buffer.from(dich, "utf8").toString("base64url")}`,
      { headers: { "User-Agent": UA_THAT }, redirect: "manual" });
    cham("Worker chuyển hướng người bấm về link gốc", rc.status === 302 || rc.status === 301,
      `HTTP ${rc.status} → ${rc.headers.get("location") || ""}`);
    const dongClick = await doiCho(async () => {
      const ds = await timTheoEmail(T.clickList, F(CFG, "clickList", "email"));
      return ds[0] || null;
    });
    if (dongClick) don[T.clickList].push(dongClick.record_id);
    cham("12.9 ghi được cú bấm", !!dongClick);
    if (dongClick) {
      await sleep(3000);
      const lai = (await listAllRecords(CFG, T.clickList)).find((r) => r.record_id === dongClick.record_id);
      cham("12.9 · Tên KH tra được từ 12.1", chu(lai?.fields?.["Tên KH"]).includes("KIỂM THỬ"),
        chu(lai?.fields?.["Tên KH"]));
    }

    // ── 7. Huỷ nhận ─────────────────────────────────────────────────────────
    console.log("\n⑦ Huỷ nhận → 12.6");
    await fetch(`${BASE}/u?t=${tokMo}`, { headers: { "User-Agent": UA_THAT }, redirect: "manual" });
    const dongHuy = await doiCho(async () => {
      const ds = await timTheoEmail(T.unsubscribe, F(CFG, "unsubscribe", "email"));
      return ds[0] || null;
    });
    if (dongHuy) don[T.unsubscribe].push(dongHuy.record_id);
    cham("12.6 ghi được yêu cầu huỷ", !!dongHuy);
    if (dongHuy) {
      await sleep(3000);
      const lai = (await listAllRecords(CFG, T.unsubscribe)).find((r) => r.record_id === dongHuy.record_id);
      cham("12.6 · Tra cứu ra tên người huỷ", chu(lai?.fields?.["Tra cứu"]).includes("KIỂM THỬ"),
        chu(lai?.fields?.["Tra cứu"]));
    }

    // ── 8. Chốt chặn gửi ────────────────────────────────────────────────────
    console.log("\n⑧ Người đã huỷ có bị chặn gửi không");
    const { buildSuppression } = await import("./suppression.mjs");
    const chan = await buildSuppression(CFG);
    cham("suppression chặn địa chỉ vừa huỷ nhận", chan.has(EMAIL),
      `danh sách chặn đang có ${chan.size} địa chỉ`);
  } catch (e) {
    cham("chạy trọn vẹn không văng lỗi", false, e.message);
  } finally {
    // ── 9. Dọn ────────────────────────────────────────────────────────────
    if (GIU) console.log("\n⑨ Giữ lại dữ liệu thử theo cờ --giu (nhớ tự xoá sau)");
    else {
      console.log("\n⑨ Dọn dữ liệu thử");
      let thay = 0, xong = 0;
      for (const tid of new Set(Object.keys(don))) {
        const r = await xoaRac(tid);
        thay += r.thay; xong += r.xong;
      }
      console.log(`   xoá ${xong}/${thay} dòng thử`);
      if (xong < thay) cham("dọn sạch dữ liệu thử", false, `còn sót ${thay - xong} dòng`);
    }
  }

  console.log(`\n══ ĐẠT ${dat} · HỎNG ${hong} ══`);
  if (hong) {
    console.log("\nNhững chỗ chưa đạt:");
    for (const k of ket) if (!k.ok) console.log(`   ✘ ${k.ten}${k.ghi ? " — " + k.ghi : ""}`);
  }
  process.exit(hong ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
