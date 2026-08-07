/**
 * build-dashboard.mjs — sinh TRANG DASHBOARD ĐỒ THỊ từ số liệu thật trên Lark.
 *
 * Đọc 12.10 (báo cáo chiến dịch) + 12.11 (tổng quan theo ngày) → dựng một trang HTML
 * TỰ CHỨA (không cần mạng, không thư viện ngoài, biểu đồ vẽ bằng SVG) vào thư mục dashboard/.
 *   dashboard/index.html     — mở bằng trình duyệt, hoặc đem deploy Cloudflare Pages
 *   dashboard/artifact.html  — phần thân, dùng khi publish lên link chia sẻ
 *
 * Chạy `node scripts/build-report.mjs` TRƯỚC để 12.10/12.11 có số mới, rồi mới chạy file này.
 *
 * Bảng màu lấy theo bộ đã kiểm chứng mù màu (blue ordinal cho phễu, status cho sức khoẻ
 * danh sách). Đừng đổi hex tuỳ hứng — mỗi màu đã qua kiểm tra tương phản trên cả nền sáng/tối.
 *
 * Chạy: node scripts/build-dashboard.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, requireKeys, listAllRecords, F } from "./lib.mjs";
import { getText } from "./suppression.mjs";

const CFG = loadConfig();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "dashboard");

const toNum = (v) => (v == null || v === "" ? 0 : Number(v) || 0);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nf = (n) => new Intl.NumberFormat("vi-VN").format(n);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// ── bảng màu (đã kiểm chứng) ────────────────────────────────────────────────
const RAMP = { light: ["#86b6ef", "#2a78d6", "#184f95"], dark: ["#86b6ef", "#3987e5", "#184f95"] };
const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" };

/** Thanh ngang bo tròn đầu ngoài, neo vào lề trái — dùng cho phễu và cho từng chiến dịch. */
function thanh(x, y, w, h, mau, nhan) {
  const r = Math.min(4, w / 2);
  if (w <= 0.5) return `<rect x="${x}" y="${y}" width="2" height="${h}" fill="${mau}" opacity="0.25"><title>${esc(nhan)}</title></rect>`;
  return `<path d="M${x} ${y} H${x + w - r} a${r} ${r} 0 0 1 ${r} ${r} V${y + h - r} a${r} ${r} 0 0 1 ${-r} ${r} H${x} Z" fill="${mau}"><title>${esc(nhan)}</title></path>`;
}

/** PHỄU: Đã gửi → Người mở → Người bấm. Ba bậc của cùng một đại lượng ⇒ một dải màu, đậm dần. */
function vePheu(sent, opened, clicked) {
  const W = 640, H = 168, L = 96, barH = 34, gap = 22;
  const buoc = [
    { ten: "Đã gửi", v: sent, i: 0 },
    { ten: "Người mở", v: opened, i: 1 },
    { ten: "Người bấm", v: clicked, i: 2 },
  ];
  const max = Math.max(sent, 1);
  const rows = buoc.map((b, k) => {
    const y = k * (barH + gap) + 8;
    const w = (b.v / max) * (W - L - 96);
    const p = k === 0 ? 100 : pct(b.v, sent);
    return `
    <g class="bar">
      <text x="${L - 12}" y="${y + barH / 2 + 5}" class="lbl" text-anchor="end">${b.ten}</text>
      <rect x="${L}" y="${y}" width="${W - L - 96}" height="${barH}" class="track" rx="4"></rect>
      ${thanh(L, y, w, barH, `var(--ramp-${b.i})`, `${b.ten}: ${nf(b.v)} (${p}%)`)}
      <text x="${W - 88}" y="${y + barH / 2 + 5}" class="val">${nf(b.v)}<tspan class="val-sub">  ${p}%</tspan></text>
    </g>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Phễu: đã gửi ${sent}, người mở ${opened}, người bấm ${clicked}">${rows}</svg>`;
}

/** SỨC KHOẺ DANH SÁCH: một thanh xếp chồng + chú giải có nhãn (màu không bao giờ đứng một mình). */
function veSucKhoe(items) {
  const tong = items.reduce((s, i) => s + i.v, 0);
  const W = 640, H = 30;
  let x = 0;
  const segs = items.filter((i) => i.v > 0).map((i) => {
    const w = (i.v / Math.max(tong, 1)) * W;
    const seg = `<rect x="${x}" y="0" width="${Math.max(w - 2, 1)}" height="${H}" fill="${i.mau}" rx="3"><title>${esc(i.ten)}: ${nf(i.v)}</title></rect>`;
    x += w;
    return seg;
  }).join("");
  const bar = tong > 0
    ? `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="stack" role="img" aria-label="Sức khoẻ danh sách">${segs}</svg>`
    : `<div class="empty-bar">Chưa có ai trong danh sách</div>`;
  const chu = items.map((i) => `
    <li><span class="dot" style="background:${i.mau}"></span><span class="dot-lbl">${i.ten}</span><b>${nf(i.v)}</b></li>`).join("");
  return `${bar}<ul class="legend">${chu}</ul>`;
}

/** XU HƯỚNG: đường theo ngày. Dưới 2 mốc thì KHÔNG vẽ đường giả — nói thẳng là chưa đủ dữ liệu. */
function veXuHuong(days) {
  if (days.length < 2) {
    return `<div class="empty">
      <p><b>Chưa vẽ được đường xu hướng.</b></p>
      <p>Cần ít nhất 2 ngày số liệu — hiện mới có ${days.length}. Mỗi lần chạy báo cáo sẽ ghi thêm một mốc, vài ngày nữa biểu đồ này tự hiện.</p>
    </div>`;
  }
  const W = 640, H = 200, P = { t: 16, r: 16, b: 28, l: 40 };
  const max = Math.max(...days.map((d) => Math.max(d.nlActive, d.unsubTotal)), 1);
  const px = (i) => P.l + (i / (days.length - 1)) * (W - P.l - P.r);
  const py = (v) => H - P.b - (v / max) * (H - P.t - P.b);
  const duong = (key, mau) => {
    const d = days.map((x, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(x[key]).toFixed(1)}`).join(" ");
    const cuoi = days[days.length - 1];
    return `<path d="${d}" fill="none" stroke="${mau}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
      <circle cx="${px(days.length - 1)}" cy="${py(cuoi[key])}" r="4.5" fill="${mau}" stroke="var(--surface)" stroke-width="2"></circle>`;
  };
  const luoi = [0, 0.5, 1].map((f) => {
    const y = H - P.b - f * (H - P.t - P.b);
    return `<line x1="${P.l}" y1="${y}" x2="${W - P.r}" y2="${y}" class="grid"></line>
      <text x="${P.l - 8}" y="${y + 4}" class="tick" text-anchor="end">${nf(Math.round(max * f))}</text>`;
  }).join("");
  const moc = days.map((d, i) => (i === 0 || i === days.length - 1)
    ? `<text x="${px(i)}" y="${H - 8}" class="tick" text-anchor="${i ? "end" : "start"}">${esc(d.day.slice(5))}</text>` : "").join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Xu hướng danh sách theo ngày">
    ${luoi}${moc}
    ${duong("nlActive", "var(--ramp-1)")}
    ${duong("unsubTotal", STATUS.warning)}
  </svg>
  <ul class="legend">
    <li><span class="dot" style="background:var(--ramp-1)"></span><span class="dot-lbl">Đang nhận bản tin</span></li>
    <li><span class="dot" style="background:${STATUS.warning}"></span><span class="dot-lbl">Đã huỷ nhận (luỹ kế)</span></li>
  </ul>`;
}

/** Mỗi chiến dịch một hàng: thanh nền = đã gửi, hai thanh mảnh chồng lên = mở và bấm. */
function veChienDich(rows) {
  if (!rows.length) return `<div class="empty"><p><b>Chưa có chiến dịch nào được gửi.</b></p><p>Gửi một bản tin hoặc một bước nuôi dưỡng rồi chạy lại báo cáo.</p></div>`;
  const max = Math.max(...rows.map((r) => r.sent), 1);
  return rows.map((r) => {
    const w = (v) => (v / max) * 100;
    return `<div class="camp">
      <div class="camp-head"><span class="camp-name">${esc(r.name)}</span><span class="camp-kind ${r.kind === "Bản tin" ? "k-nl" : "k-nt"}">${esc(r.kind)}</span></div>
      <div class="camp-bars">
        <div class="cb"><i style="width:${w(r.sent)}%;background:var(--ramp-0)"></i><span>${nf(r.sent)} gửi</span></div>
        <div class="cb"><i style="width:${w(r.opened)}%;background:var(--ramp-1)"></i><span>${nf(r.opened)} mở · ${r.openRate}%</span></div>
        <div class="cb"><i style="width:${w(r.clicked)}%;background:var(--ramp-2)"></i><span>${nf(r.clicked)} bấm · ${r.clickRate}%</span></div>
      </div>
    </div>`;
  }).join("");
}

function renderBody(D) {
  const canhBao = [];
  if (!CFG.tracker.baseUrl) canhBao.push({ m: "critical", t: "Chưa đo được mở & bấm", d: "Hệ chưa gắn máy chủ theo dõi, nên hai cột Mở và Bấm sẽ mãi bằng 0 dù thư có được đọc. Dựng Worker rồi số mới chạy." });
  if (D.blockedTotal > 0) canhBao.push({ m: "critical", t: `${D.blockedTotal} địa chỉ bị chặn ngay từ đầu gửi`, d: "Lỗi nằm ở phía mình chứ không phải địa chỉ khách sai — thường là do tên miền chưa bật chữ ký DKIM. Bật DKIM trước khi gửi tiếp cho Gmail." });
  if (D.nurtureActive === 0 && D.nurtureTotal > 0) canhBao.push({ m: "warning", t: "Không còn ai đang được nuôi dưỡng", d: `Cả ${D.nurtureTotal} người trong danh sách đều đã bị đóng sổ. Nếu anh chưa đổ đủ nội dung 365 ngày thì đây là dấu hiệu họ bị đánh "Hoàn thành" quá sớm.` });

  const tiles = [
    { ten: "Đang nuôi dưỡng", v: D.nurtureActive, phu: `trên tổng ${nf(D.nurtureTotal)} người` },
    { ten: "Đang nhận bản tin", v: D.nlActive, phu: `trên tổng ${nf(D.nlTotal)} người` },
    { ten: "Thư đã gửi", v: D.sentTotal, phu: "cộng dồn mọi chiến dịch" },
    { ten: "Tỉ lệ bấm link", v: `${pct(D.clickedPeople, D.sentTotal)}%`, phu: `${nf(D.clickedPeople)} người đã bấm` },
  ];

  return `<style>
  .dash { --surface:#fcfcfb; --plane:#f9f9f7; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781;
          --grid:#e1e0d9; --line:#c3c2b7; --ring:rgba(11,11,11,.10);
          --ramp-0:${RAMP.light[0]}; --ramp-1:${RAMP.light[1]}; --ramp-2:${RAMP.light[2]};
          color-scheme:light; }
  @media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) .dash {
          --surface:#1a1a19; --plane:#0d0d0d; --ink:#fff; --ink2:#c3c2b7; --muted:#898781;
          --grid:#2c2c2a; --line:#383835; --ring:rgba(255,255,255,.10);
          --ramp-0:${RAMP.dark[0]}; --ramp-1:${RAMP.dark[1]}; --ramp-2:${RAMP.dark[2]}; color-scheme:dark; } }
  :root[data-theme="dark"] .dash { --surface:#1a1a19; --plane:#0d0d0d; --ink:#fff; --ink2:#c3c2b7; --muted:#898781;
          --grid:#2c2c2a; --line:#383835; --ring:rgba(255,255,255,.10);
          --ramp-0:${RAMP.dark[0]}; --ramp-1:${RAMP.dark[1]}; --ramp-2:${RAMP.dark[2]}; color-scheme:dark; }

  .dash { background:var(--plane); color:var(--ink); min-height:100vh; padding:28px 20px 56px;
          font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; line-height:1.55; }
  .dash * { box-sizing:border-box; }
  .wrap { max-width:1080px; margin:0 auto; display:flex; flex-direction:column; gap:20px; }

  .top { display:flex; flex-wrap:wrap; align-items:baseline; gap:10px 16px; }
  .top h1 { font-size:26px; font-weight:700; letter-spacing:-.02em; margin:0; text-wrap:balance; }
  .top .sub { color:var(--ink2); font-size:14px; }
  .top .when { margin-left:auto; color:var(--muted); font-size:13px; font-variant-numeric:tabular-nums; }

  .alert { display:flex; gap:12px; padding:13px 15px; background:var(--surface); border:1px solid var(--ring);
           border-radius:10px; border-left:4px solid var(--sev); }
  .alert b { display:block; font-size:14.5px; }
  .alert p { margin:2px 0 0; color:var(--ink2); font-size:13.5px; }
  .alert .ico { flex:none; width:20px; height:20px; margin-top:1px; }

  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; }
  .tile { background:var(--surface); border:1px solid var(--ring); border-radius:10px; padding:14px 16px; }
  .tile .k { font-size:11.5px; letter-spacing:.07em; text-transform:uppercase; color:var(--muted); }
  .tile .v { font-size:32px; font-weight:700; letter-spacing:-.02em; margin-top:2px; }
  .tile .p { font-size:12.5px; color:var(--ink2); }

  .card { background:var(--surface); border:1px solid var(--ring); border-radius:10px; padding:18px 18px 16px; }
  .card > h2 { font-size:15px; font-weight:650; margin:0 0 3px; }
  .card > .note { font-size:13px; color:var(--ink2); margin:0 0 14px; }
  .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:16px; }

  svg { width:100%; height:auto; display:block; overflow:visible; }
  .lbl { font-size:12.5px; fill:var(--ink2); }
  .val { font-size:13px; fill:var(--ink); font-weight:650; font-variant-numeric:tabular-nums; }
  .val-sub { fill:var(--muted); font-weight:400; }
  .tick { font-size:11px; fill:var(--muted); font-variant-numeric:tabular-nums; }
  .grid { stroke:var(--grid); stroke-width:1; }
  .track { fill:var(--grid); opacity:.5; }
  .bar:hover .val { fill:var(--ramp-2); }
  .stack { height:30px; border-radius:4px; }

  .legend { list-style:none; display:flex; flex-wrap:wrap; gap:6px 18px; margin:12px 0 0; padding:0; font-size:13px; }
  .legend li { display:flex; align-items:center; gap:7px; }
  .legend b { font-variant-numeric:tabular-nums; }
  .dot { width:10px; height:10px; border-radius:3px; flex:none; }
  .dot-lbl { color:var(--ink2); }

  .camp { padding:12px 0; border-top:1px solid var(--grid); }
  .camp:first-child { border-top:0; padding-top:0; }
  .camp-head { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
  .camp-name { font-weight:600; font-size:14px; }
  .camp-kind { font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid var(--ring); color:var(--ink2); }
  .camp-bars { display:flex; flex-direction:column; gap:5px; }
  .cb { display:flex; align-items:center; gap:10px; }
  .cb i { height:9px; border-radius:4px; min-width:2px; display:block; }
  .cb span { font-size:12.5px; color:var(--ink2); white-space:nowrap; font-variant-numeric:tabular-nums; }

  .empty, .empty-bar { border:1px dashed var(--line); border-radius:8px; padding:16px; color:var(--ink2); font-size:13.5px; }
  .empty p { margin:0 0 4px; } .empty p:last-child { margin:0; }
  .empty-bar { text-align:center; padding:10px; }

  .tbl-wrap { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th, td { text-align:right; padding:8px 10px; border-bottom:1px solid var(--grid); font-variant-numeric:tabular-nums; white-space:nowrap; }
  th:first-child, td:first-child { text-align:left; font-variant-numeric:normal; }
  th { font-size:11.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); font-weight:600; }
  tbody tr:hover { background:var(--grid); }

  .foot { color:var(--muted); font-size:12.5px; }
  .foot b { color:var(--ink2); }
  @media (max-width:560px) { .top .when { margin-left:0; width:100%; } .dash { padding:20px 14px 40px; } }
</style>

<div class="dash"><div class="wrap">

  <header class="top">
    <h1>Email Marketing</h1>
    <span class="sub">MENTOR CAMP CRM</span>
    <span class="when">Số liệu lúc ${esc(D.capNhat)}</span>
  </header>

  ${canhBao.map((c) => `<div class="alert" style="--sev:${c.m === "critical" ? STATUS.critical : STATUS.warning}">
    <svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.6 18.4 17H1.6L10 2.6Z" fill="none" stroke="${c.m === "critical" ? STATUS.critical : STATUS.warning}" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 8v4.2" stroke="${c.m === "critical" ? STATUS.critical : STATUS.warning}" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14.6" r="1" fill="${c.m === "critical" ? STATUS.critical : STATUS.warning}"/></svg>
    <div><b>${esc(c.t)}</b><p>${esc(c.d)}</p></div>
  </div>`).join("")}

  <section class="tiles">
    ${tiles.map((t) => `<div class="tile"><div class="k">${esc(t.ten)}</div><div class="v">${typeof t.v === "number" ? nf(t.v) : esc(t.v)}</div><div class="p">${esc(t.phu)}</div></div>`).join("")}
  </section>

  <div class="grid2">
    <section class="card">
      <h2>Từ thư gửi đi đến người bấm link</h2>
      <p class="note">Mỗi bậc là phần còn lại của bậc trên. Bấm link là con số đáng tin nhất — máy quét không bấm hộ.</p>
      ${vePheu(D.sentTotal, D.openedPeople, D.clickedPeople)}
    </section>

    <section class="card">
      <h2>Sức khoẻ danh sách</h2>
      <p class="note">Người còn nhận được thư, so với phần đã mất vì huỷ nhận, địa chỉ hỏng và mail ảo.</p>
      ${veSucKhoe([
        { ten: "Đang nhận", v: D.nlActive + D.nurtureActive, mau: STATUS.good },
        { ten: "Đã huỷ nhận", v: D.unsubTotal, mau: STATUS.warning },
        { ten: "Mail ảo", v: D.fakeInvalid, mau: STATUS.serious },
        { ten: "Địa chỉ hỏng", v: D.errorTotal, mau: STATUS.critical },
      ])}
    </section>
  </div>

  <section class="card">
    <h2>Xu hướng danh sách theo ngày</h2>
    <p class="note">Mỗi lần chạy báo cáo ghi thêm một mốc. Đường huỷ nhận vọt lên là dấu hiệu gửi quá tay.</p>
    ${veXuHuong(D.days)}
  </section>

  <section class="card">
    <h2>Từng chiến dịch</h2>
    <p class="note">Thanh nhạt là số thư gửi đi, hai thanh đậm dần là số người mở và số người bấm.</p>
    ${veChienDich(D.rows)}
  </section>

  <section class="card">
    <h2>Bảng số liệu</h2>
    <p class="note">Cùng dữ liệu với các biểu đồ trên, dạng đọc được bằng máy đọc màn hình và sao chép được.</p>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Chiến dịch</th><th>Loại</th><th>Đã gửi</th><th>Mở</th><th>Tỉ lệ mở</th><th>Bấm</th><th>Tỉ lệ bấm</th><th>Huỷ</th></tr></thead>
      <tbody>${D.rows.length ? D.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.kind)}</td><td>${nf(r.sent)}</td><td>${nf(r.opened)}</td><td>${r.openRate}%</td><td>${nf(r.clicked)}</td><td>${r.clickRate}%</td><td>${nf(r.unsub)}</td></tr>`).join("")
        : `<tr><td colspan="8" style="text-align:center;color:var(--muted)">Chưa có chiến dịch nào được gửi</td></tr>`}</tbody>
    </table></div>
  </section>

  <p class="foot">Số liệu lấy từ bảng <b>12.10</b> và <b>12.11</b> trong base MENTOR CAMP CRM.
  Trang này là ảnh chụp tại thời điểm dựng — chạy lại <b>build-report</b> rồi <b>build-dashboard</b> để cập nhật.
  Tỉ lệ mở chỉ mang tính tham khảo vì nhiều ứng dụng thư tự tải ảnh thay người dùng.</p>

</div></div>`;
}

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret", "tables.reportCampaign", "tables.reportDaily"]);

  const [camps, dailies] = await Promise.all([
    listAllRecords(CFG, CFG.tables.reportCampaign),
    listAllRecords(CFG, CFG.tables.reportDaily),
  ]);

  const fc = (k) => F(CFG, "reportCampaign", k);
  const rows = camps.map((r) => ({
    name: [getText(r.fields, fc("campaign")), getText(r.fields, fc("step"))].filter(Boolean).join(" · "),
    kind: getText(r.fields, fc("kind")) || "Bản tin",
    sent: toNum(r.fields?.[fc("sent")]),
    opened: toNum(r.fields?.[fc("opened")]),
    openRate: toNum(r.fields?.[fc("openRate")]),
    clicked: toNum(r.fields?.[fc("clicked")]),
    clickRate: toNum(r.fields?.[fc("clickRate")]),
    unsub: toNum(r.fields?.[fc("unsub")]),
  })).sort((a, b) => b.sent - a.sent);

  const fd = (k) => F(CFG, "reportDaily", k);
  const days = dailies.map((r) => ({
    day: getText(r.fields, fd("day")),
    nlActive: toNum(r.fields?.[fd("nlActive")]),
    unsubTotal: toNum(r.fields?.[fd("unsubTotal")]),
  })).filter((d) => d.day).sort((a, b) => a.day.localeCompare(b.day));

  const moi = dailies.length
    ? dailies.map((r) => ({ day: getText(r.fields, fd("day")), f: r.fields })).sort((a, b) => a.day.localeCompare(b.day)).pop().f
    : null;
  if (!moi) { console.error("❌ Bảng 12.11 chưa có dòng nào — chạy `node scripts/build-report.mjs` trước."); process.exit(1); }
  const g = (k) => toNum(moi[fd(k)]);

  const D = {
    capNhat: new Date(Date.now() + 7 * 3600000).toISOString().replace("T", " ").slice(0, 16) + " (giờ VN)",
    nurtureActive: g("nurtureActive"), nurtureTotal: g("nurtureTotal"),
    nlActive: g("nlActive"), nlTotal: g("nlTotal"),
    unsubTotal: g("unsubTotal"), errorTotal: g("errorTotal"), blockedTotal: g("blockedTotal"),
    fakeInvalid: g("fakeInvalid"), sentTotal: g("sentTotal"),
    openedPeople: rows.reduce((s, r) => s + r.opened, 0),
    clickedPeople: rows.reduce((s, r) => s + r.clicked, 0),
    rows, days,
  };

  const body = renderBody(D);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "artifact.html"), `<title>Email Marketing — MENTOR CAMP CRM</title>\n${body}\n`, "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "index.html"),
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email Marketing — MENTOR CAMP CRM</title><style>*{margin:0}body{margin:0}</style></head><body>\n${body}\n</body></html>\n`, "utf8");

  console.log(`✅ Đã dựng dashboard:`);
  console.log(`   ${path.join(OUT_DIR, "index.html")}   (mở bằng trình duyệt)`);
  console.log(`   ${path.join(OUT_DIR, "artifact.html")} (dùng để publish link)`);
  console.log(`   ${D.rows.length} chiến dịch · ${D.days.length} mốc ngày · gửi ${D.sentTotal} · mở ${D.openedPeople} · bấm ${D.clickedPeople}`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
