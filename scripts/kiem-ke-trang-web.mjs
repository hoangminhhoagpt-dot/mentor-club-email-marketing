/**
 * kiem-ke-trang-web.mjs — kiểm kê toàn bộ trang đang chạy trên Cloudflare Pages
 * rồi ghi vào bảng "20.1 Danh sách trang web" của Lark Base.
 *
 * Làm ba việc: hỏi Cloudflare có những trang nào → gọi thử từng trang xem còn sống
 * và lấy tiêu đề → upsert vào bảng theo tên dự án (chạy lại không đẻ dòng trùng).
 *
 * Mục đích từng trang nằm trong bảng MO_TA bên dưới — thêm trang mới thì thêm một dòng
 * vào đó, không thì nó vào nhóm "Khác" và ghi "Chưa xác định".
 *
 * Cần: token Cloudflare có quyền đọc Pages, để trong C:\Users\<user>\.mentor-club\ha-tang.json
 * Chạy: node scripts/kiem-ke-trang-web.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, requireKeys, listAllRecords, createRecord, updateRecord, larkApi, resolveAppToken } from "./lib.mjs";
import { getText } from "./suppression.mjs";

const CFG = loadConfig();
const TEN_BANG = "20.1 Danh sách trang web";
const KHO_TOKEN = path.join(os.homedir(), ".mentor-club", "ha-tang.json");

const MO_TA = {
  trienkhaiemail:   ["Triển khai", "Hệ Email Marketing trên Lark: nuôi dưỡng 365 ngày, bản tin, đo mở/bấm"],
  trienkhaifb:      ["Triển khai", "Facebook ⇄ Lark: kéo danh sách Fanpage, đăng bài và Reel từ bảng"],
  trienkhaitiktok:  ["Triển khai", "TikTok ⇄ Lark: kéo số liệu video về, đẩy video vào hộp thư nháp"],
  trienkhaiyt:      ["Triển khai", "YouTube ⇄ Lark: kéo số liệu kênh và video, tải video lên kênh"],
  trienkhaitom:     ["Triển khai", "TÔM Voice: nói vào nhóm Lark, Claude Code làm việc trên máy mình"],
  trienkhaileadpage:["Triển khai", "Leadpage Ebook: dựng trang thu khách, dữ liệu về thẳng Lark Base"],
  trienkhaisp:      ["Triển khai", "SePay: khách chuyển khoản là đơn tự đánh dấu đã thanh toán"],
  trienkhaiwp:      ["Triển khai", "Claude ⇄ WordPress: sửa bài, trang, sản phẩm bằng lời nói"],
  trienkhaihskh:    ["Triển khai", "Hồ sơ khách hàng: từ một phiếu và thư mục tài liệu ra bộ 9 tệp"],
  "doanh-nghiep-ai-first":   ["Bán hàng & sự kiện", "Sự kiện Doanh Nghiệp AI First 20–22/08/2026 tại TP.HCM"],
  "mentorclub-family-camp":  ["Bán hàng & sự kiện", "Đăng ký Mentorclub Family Camp 2026, 24–29/08 tại Bình Dương"],
  "mentor-family-camp":      ["Bán hàng & sự kiện", "Family Camp 24–28/08/2026 — bản trên tên miền hoangminhhoa.com"],
  "hanh-phuc-roi-kinh-doanh":["Bán hàng & sự kiện", "Khoá 7 buổi tối Hạnh Phúc Rồi Kinh Doanh"],
  "x3-online":               ["Bán hàng & sự kiện", "Khoá X3 Hiệu Suất Marketing bản online"],
  "lark-suite":              ["Bán hàng & sự kiện", "Chương trình Vận hành doanh nghiệp trên Lark Suite"],
  "thinh-vuong":             ["Bán hàng & sự kiện", "Chương trình Cuộc Đời Thịnh Vượng"],
  "leadpage-21-sai-lam-giao-vien-ra-ngoai-xa-hoi-that-bai": ["Thu khách", "Ebook 21 sai lầm khiến giáo viên ra ngoài xã hội thất bại"],
  "leadpage-hochupanh":      ["Thu khách", "Khoá miễn phí chụp ảnh đẹp bằng điện thoại (Miss Áo Dài)"],
  "sach-hoangminhhoa":       ["Thu khách", "Tủ sách Hoàng Minh Hóa — tặng sách để thu liên hệ"],
  "hoang-minh-hoa":          ["Thương hiệu", "Trang cá nhân Hoàng Minh Hóa — mentor, cố vấn nhân sinh"],
  mentorcamp:                ["Thương hiệu", "Giới thiệu Mentor Camp — nối Facebook, TikTok, YouTube và Lark"],
  "thay-cua-hoa":            ["Thương hiệu", "Trang tri ân thầy Phạm Thành Long"],
  "app-thay-nh":             ["Thương hiệu", "Studio Success"],
  hoavon:                    ["Công cụ", "Máy tính điểm hoà vốn cho chủ doanh nghiệp"],
  "moral-master":            ["Công cụ", "Tạo ảnh trích dẫn danh nhân"],
  mindset:                   ["Công cụ", "MindShift — tạo ảnh trích dẫn viral"],
  insightviral:              ["Công cụ", "InsightViral — tạo nội dung chạm nhận thức"],
  "x-y-k-nh-nh-n-hi-u":      ["Công cụ", "AI Branding — hỗ trợ xây kênh và nhận diện"],
  "aios-console":            ["Công cụ", "Bảng điều khiển AIOS"],
  "hoa-ai":                  ["Công cụ", "Mentor Camp Business English"],
  "khoahoc-redirect":        ["Công cụ", "Chuyển hướng khoá học của Miss Áo Dài"],
  "cf7-lead-bridge":         ["Công cụ", "Cầu nối form Contact Form 7 sang nơi nhận khách"],
  "my-site":                 ["Khác", "Web mẫu dùng để thử quy trình đưa trang lên Cloudflare"],
};

function tokenCloudflare() {
  if (!fs.existsSync(KHO_TOKEN)) throw new Error(`Chưa có kho token: ${KHO_TOKEN}`);
  const k = JSON.parse(fs.readFileSync(KHO_TOKEN, "utf8").replace(/^\uFEFF/, ""));
  if (!k.cloudflare?.api_token) throw new Error("Kho token chưa có cloudflare.api_token");
  return { tok: k.cloudflare.api_token, acc: k.cloudflare.account_id };
}

/** Cloudflare trả mỗi lần 10 dự án, phải lật trang cho tới khi hết. */
async function danhSachTrang({ tok, acc }) {
  const H = { Authorization: `Bearer ${tok}` };
  const ra = [];
  for (let p = 1; p <= 20; p++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/pages/projects?page=${p}`, { headers: H });
    const j = await r.json();
    if (!j.success) throw new Error(`Cloudflare: ${JSON.stringify(j.errors)}`);
    if (!j.result.length) break;
    ra.push(...j.result);
  }
  return ra;
}

async function thuGoi(diaChi) {
  try {
    const r = await fetch(`https://${diaChi}`, { redirect: "follow", signal: AbortSignal.timeout(12000) });
    const html = await r.text();
    const m = html.match(/<title>([\s\S]*?)<\/title>/i);
    return { ma: r.status, tieuDe: m ? m[1].trim() : "" };
  } catch {
    return { ma: -1, tieuDe: "" };
  }
}

(async () => {
  requireKeys(CFG, ["larkAppId", "larkAppSecret"]);
  const app = await resolveAppToken(CFG);

  // tìm bảng theo TÊN — không cần nhớ mã bảng
  const ds = await larkApi(CFG, "GET", `/open-apis/bitable/v1/apps/${app}/tables?page_size=100`);
  const bang = (ds.items || []).find((t) => t.name === TEN_BANG);
  if (!bang) throw new Error(`Không thấy bảng "${TEN_BANG}" — tạo bảng trước rồi chạy lại.`);
  const T = bang.table_id;

  const cf = tokenCloudflare();
  const duAn = await danhSachTrang(cf);
  console.log(`Cloudflare đang có ${duAn.length} trang.\n`);

  const daCo = await listAllRecords(CFG, T);
  const theoDuAn = new Map(daCo.map((r) => [getText(r.fields, "Dự án Cloudflare"), r.record_id]));

  let moi = 0, capNhat = 0, chet = 0, chuaRo = 0;
  for (const p of duAn) {
    const doms = p.domains || [];
    const chinh = doms.find((d) => !d.endsWith(".pages.dev")) || doms[0] || `${p.name}.pages.dev`;
    const duPhong = doms.find((d) => d.endsWith(".pages.dev"));
    const { ma, tieuDe } = await thuGoi(chinh);
    if (ma !== 200) chet++;
    const md = MO_TA[p.name];
    if (!md) chuaRo++;

    const fields = {
      "Tên trang": tieuDe || p.name,
      "Địa chỉ": { link: `https://${chinh}`, text: chinh },
      "Nhóm": md ? md[0] : "Khác",
      "Mục đích": md ? md[1] : "Chưa xác định — cần xem lại",
      "Trạng thái": ma === 200 ? "Đang chạy" : "Lỗi",
      "Mã HTTP": ma,
      "Dự án Cloudflare": p.name,
      "Ghi chú": chinh.endsWith(".pages.dev") ? "Chưa gắn tên miền riêng" : "",
    };
    if (duPhong) fields["Địa chỉ dự phòng"] = { link: `https://${duPhong}`, text: duPhong };
    const t = Date.parse(p.latest_deployment?.created_on || "");
    if (!Number.isNaN(t)) fields["Cập nhật lần cuối"] = t;

    const id = theoDuAn.get(p.name);
    if (id) { await updateRecord(CFG, T, id, fields); capNhat++; }
    else { await createRecord(CFG, T, fields); moi++; }
    console.log(`  ${String(ma).padStart(3)}  ${p.name.padEnd(40).slice(0, 40)} ${(md ? md[0] : "Khác")}`);
  }

  console.log(`\n✅ Kiểm kê xong: tạo mới ${moi} · cập nhật ${capNhat} · tổng ${duAn.length}`);
  if (chet) console.log(`⚠️  ${chet} trang KHÔNG gọi được — xem cột Mã HTTP để biết trang nào.`);
  if (chuaRo) console.log(`📝 ${chuaRo} trang chưa khai mục đích — thêm vào bảng MO_TA trong file này.`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
