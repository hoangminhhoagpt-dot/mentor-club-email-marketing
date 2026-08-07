/**
 * build-report.mjs — dựng BÁO CÁO cho hệ Email Marketing.
 *   12.10 Báo cáo chiến dịch  — mỗi bản tin / mỗi bước nuôi dưỡng một dòng (gửi · mở · bấm · huỷ).
 *   12.11 Tổng quan theo ngày — mỗi ngày một dòng ảnh chụp, để Lark vẽ đường xu hướng.
 *
 * CHỈ ĐỌC 12.1→12.9 rồi GHI vào 12.10/12.11 — không gửi email, không đụng dữ liệu gốc.
 * Chạy lại bao nhiêu lần cũng được: upsert theo (Chiến dịch + Bước) và theo Mốc ngày.
 *
 * Chạy: node scripts/build-report.mjs
 */
import {
  loadConfig, requireKeys, listAllRecords, createRecord, updateRecord, F, normEmail, nowMs,
} from "./lib.mjs";
import { getText } from "./suppression.mjs";

const CFG = loadConfig();

// ⚠️ PHẢI khớp CHÍNH XÁC cách hai script gửi đặt tên lúc phát thư, nếu không báo cáo sẽ
// ghép nhầm số liệu: send-nurture.mjs đặt campaign="Nuôi dưỡng 365", step=`Ngày N`;
// send-newsletter.mjs đặt campaign=`Bảng tin: <tiêu đề>` (cắt 100 ký tự), step="".
const CAMPAIGN_NURTURE = "Nuôi dưỡng 365";
const nlCampaignName = (subject) => `Bảng tin: ${subject}`.slice(0, 100);

const toNum = (v) => (v == null || v === "" ? 0 : Number(v) || 0);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const key = (campaign, step) => `${campaign}||${step || ""}`;

/** Ngày hôm nay theo giờ VN (GMT+7) dạng yyyy-MM-dd — mốc của một dòng 12.11. */
function ngayVN() {
  return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
}

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret", "tables.reportCampaign", "tables.reportDaily"]);

  // ---- đọc toàn bộ nguồn ----
  const [nurture, camp365, nlList, nlMail, opens, unsubs, fakes, errors, clicks] = await Promise.all([
    listAllRecords(CFG, CFG.tables.nurtureList),
    listAllRecords(CFG, CFG.tables.campaign365),
    listAllRecords(CFG, CFG.tables.newsletterList),
    listAllRecords(CFG, CFG.tables.newsletterMail),
    listAllRecords(CFG, CFG.tables.openReport),
    listAllRecords(CFG, CFG.tables.unsubscribe),
    listAllRecords(CFG, CFG.tables.fakeFilter),
    listAllRecords(CFG, CFG.tables.errorList),
    listAllRecords(CFG, CFG.tables.clickList),
  ]);

  // ---- gom lượt MỞ theo (chiến dịch, bước) ----
  // 12.5 upsert theo email+chiến dịch+bước ⇒ mỗi người 1 dòng. Vẫn dùng Set cho chắc.
  const oCam = F(CFG, "openReport", "campaign"), oStep = F(CFG, "openReport", "step");
  const oMail = F(CFG, "openReport", "email"), oCount = F(CFG, "openReport", "openCount");
  const openIdx = new Map();
  let openTotal = 0;
  for (const r of opens) {
    const k = key(getText(r.fields, oCam), getText(r.fields, oStep));
    const g = openIdx.get(k) || { people: new Set(), hits: 0 };
    g.people.add(normEmail(getText(r.fields, oMail)));
    g.hits += toNum(r.fields?.[oCount]);
    openIdx.set(k, g);
    openTotal += toNum(r.fields?.[oCount]);
  }

  // ---- gom lượt BẤM theo (chiến dịch, bước) ----
  // 12.9 upsert theo email+chiến dịch+bước+LINK ⇒ một người bấm 3 link = 3 dòng.
  // Vì vậy "Người bấm" bắt buộc phải đếm bằng Set, không được đếm số dòng.
  const cCam = F(CFG, "clickList", "campaign"), cStep = F(CFG, "clickList", "step");
  const cMail = F(CFG, "clickList", "email"), cCount = F(CFG, "clickList", "clickCount");
  const clickIdx = new Map();
  let clickTotal = 0;
  for (const r of clicks) {
    const k = key(getText(r.fields, cCam), getText(r.fields, cStep));
    const g = clickIdx.get(k) || { people: new Set(), hits: 0 };
    g.people.add(normEmail(getText(r.fields, cMail)));
    g.hits += toNum(r.fields?.[cCount]);
    clickIdx.set(k, g);
    clickTotal += toNum(r.fields?.[cCount]);
  }

  // ---- gom HUỶ NHẬN theo chiến dịch ----
  const uCam = F(CFG, "unsubscribe", "campaign");
  const unsubIdx = new Map();
  for (const r of unsubs) {
    const c = getText(r.fields, uCam);
    unsubIdx.set(c, (unsubIdx.get(c) || 0) + 1);
  }

  // ---- dựng danh sách dòng báo cáo ----
  const rows = [];

  // (a) BẢN TIN — mỗi dòng 12.4 là một chiến dịch, "Đã gửi" là số thật script ghi lại.
  const mSub = F(CFG, "newsletterMail", "subject"), mCount = F(CFG, "newsletterMail", "sentCount");
  for (const r of nlMail) {
    const subject = getText(r.fields, mSub);
    if (!subject) continue;
    const sent = toNum(r.fields?.[mCount]);
    if (!sent) continue;                                  // chưa gửi thì chưa có gì để báo cáo
    rows.push({ campaign: nlCampaignName(subject), kind: "Bản tin", step: "", sent });
  }

  // (b) NUÔI DƯỠNG — không có nhật ký gửi từng thư, nên số đã gửi của "Ngày N" được SUY RA:
  //     đếm số người có "Bước gần nhất" >= N. Đúng khi chuỗi chạy tuần tự (đúng thiết kế),
  //     nhưng vẫn là SUY RA — có bảng nhật ký gửi thì con số này mới là đo thật.
  const nStep = F(CFG, "nurtureList", "lastStep");
  const steps = nurture.map((r) => toNum(r.fields?.[nStep]));
  const cDay = F(CFG, "campaign365", "day");
  const days = [...new Set(camp365.map((r) => toNum(r.fields?.[cDay])).filter((d) => d > 0))].sort((a, b) => a - b);
  for (const d of days) {
    const sent = steps.filter((s) => s >= d).length;
    if (!sent) continue;                                  // ngày chưa ai tới thì chưa lên báo cáo
    rows.push({ campaign: CAMPAIGN_NURTURE, kind: "Nuôi dưỡng", step: `Ngày ${d}`, sent });
  }

  // ---- ghép số liệu mở/bấm/huỷ vào từng dòng ----
  for (const row of rows) {
    const k = key(row.campaign, row.step);
    const o = openIdx.get(k), c = clickIdx.get(k);
    row.opened = o ? o.people.size : 0;
    row.clicked = c ? c.people.size : 0;
    row.clicks = c ? c.hits : 0;
    row.openRate = pct(row.opened, row.sent);
    row.clickRate = pct(row.clicked, row.sent);
    row.unsub = unsubIdx.get(row.campaign) || 0;
  }

  // ---- UPSERT 12.10 ----
  const T10 = CFG.tables.reportCampaign;
  const rCam = F(CFG, "reportCampaign", "campaign"), rStep = F(CFG, "reportCampaign", "step");
  const existing10 = await listAllRecords(CFG, T10);
  const by10 = new Map(existing10.map((r) => [key(getText(r.fields, rCam), getText(r.fields, rStep)), r.record_id]));

  let created = 0, updated = 0;
  for (const row of rows) {
    const fields = {
      [rCam]: row.campaign,
      [F(CFG, "reportCampaign", "kind")]: row.kind,
      [rStep]: row.step,
      [F(CFG, "reportCampaign", "sent")]: row.sent,
      [F(CFG, "reportCampaign", "opened")]: row.opened,
      [F(CFG, "reportCampaign", "openRate")]: row.openRate,
      [F(CFG, "reportCampaign", "clicked")]: row.clicked,
      [F(CFG, "reportCampaign", "clickRate")]: row.clickRate,
      [F(CFG, "reportCampaign", "clicks")]: row.clicks,
      [F(CFG, "reportCampaign", "unsub")]: row.unsub,
      [F(CFG, "reportCampaign", "updatedAt")]: nowMs(),
    };
    const k = key(row.campaign, row.step);
    if (by10.has(k)) { await updateRecord(CFG, T10, by10.get(k), fields); updated++; }
    else { await createRecord(CFG, T10, fields); created++; }
  }

  // ---- ẢNH CHỤP HÔM NAY → 12.11 ----
  const nStatus = F(CFG, "nurtureList", "status");
  const lStatus = F(CFG, "newsletterList", "status");
  const eType = F(CFG, "errorList", "errorType");
  const fResult = F(CFG, "fakeFilter", "result");

  const dem = (recs, field, re) => recs.filter((r) => re.test(getText(r.fields, field))).length;
  const blocked = dem(errors, eType, /bị chặn đầu gửi|912|antispam/i);
  const snapshot = {
    nurtureActive: dem(nurture, nStatus, /đang nuôi/i),
    nurtureTotal: nurture.length,
    nlActive: dem(nlList, lStatus, /đang nhận/i),
    nlTotal: nlList.length,
    unsubTotal: unsubs.length,
    errorTotal: errors.length - blocked,          // lỗi THẬT của địa chỉ nhận
    blockedTotal: blocked,                        // lỗi phía MÌNH (Lark chặn) — tách ra để không đổ oan
    fakeInvalid: dem(fakes, fResult, /không hợp lệ/i),
    sentTotal: rows.reduce((s, r) => s + r.sent, 0),
    openTotal,
    clickTotal,
  };

  const T11 = CFG.tables.reportDaily;
  const dDay = F(CFG, "reportDaily", "day");
  const homNay = ngayVN();
  const existing11 = await listAllRecords(CFG, T11);
  const found11 = existing11.find((r) => getText(r.fields, dDay) === homNay);
  const fields11 = { [dDay]: homNay, [F(CFG, "reportDaily", "updatedAt")]: nowMs() };
  for (const [k, v] of Object.entries(snapshot)) fields11[F(CFG, "reportDaily", k)] = v;
  if (found11) await updateRecord(CFG, T11, found11.record_id, fields11);
  else await createRecord(CFG, T11, fields11);

  // ---- in ra cho người đọc log ----
  console.log(`\n📊 BÁO CÁO CHIẾN DỊCH (12.10): tạo ${created} · cập nhật ${updated}`);
  for (const r of rows) {
    const ten = `${r.campaign}${r.step ? " · " + r.step : ""}`;
    console.log(`  ${ten.padEnd(46).slice(0, 46)} gửi ${String(r.sent).padStart(5)} · mở ${String(r.opened).padStart(4)} (${r.openRate}%) · bấm ${String(r.clicked).padStart(4)} (${r.clickRate}%) · huỷ ${r.unsub}`);
  }
  if (!rows.length) console.log("  (chưa có chiến dịch nào đã gửi)");

  console.log(`\n📈 TỔNG QUAN ${homNay} (12.11)`);
  console.log(`  Nuôi dưỡng : ${snapshot.nurtureActive}/${snapshot.nurtureTotal} đang nuôi`);
  console.log(`  Bản tin    : ${snapshot.nlActive}/${snapshot.nlTotal} đang nhận`);
  console.log(`  Đã huỷ     : ${snapshot.unsubTotal} · Mail lỗi: ${snapshot.errorTotal} · Bị chặn đầu gửi: ${snapshot.blockedTotal} · Mail ảo: ${snapshot.fakeInvalid}`);
  console.log(`  Thư đã gửi : ${snapshot.sentTotal} · Lượt mở: ${snapshot.openTotal} · Lượt bấm: ${snapshot.clickTotal}`);
  if (!CFG.tracker.baseUrl) {
    console.log(`\n⚠️  Chưa cấu hình tracker.baseUrl — cột Mở/Bấm sẽ MÃI bằng 0 dù thư có được đọc.`);
  }
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
