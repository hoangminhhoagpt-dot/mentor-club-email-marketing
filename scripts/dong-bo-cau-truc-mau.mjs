/**
 * dong-bo-cau-truc-mau.mjs — dựng đủ cột của bảng 12.1 theo bản mẫu MAD CRM,
 * gồm cả hệ CHẤM ĐIỂM khách hàng (OpenRate → RecencyScore → LoyaltyScore →
 * Phân cấp trung thành → CallToSell).
 *
 * Vì sao phải chia 6 bước thay vì tạo một lượt: công thức Lark tham chiếu cột khác
 * bằng MÃ CỘT chứ không phải tên. Cột chưa tồn tại thì chưa có mã, nên phải tạo xong
 * tầng dưới, đọc lại mã, mới viết được tầng trên. Tạo một lượt là công thức rỗng
 * vĩnh viễn mà API vẫn trả code=0.
 *
 * Chạy lại được: cột nào có rồi thì bỏ qua.
 * Chạy: node scripts/dong-bo-cau-truc-mau.mjs
 */import fs from "node:fs";

const CFG = JSON.parse(fs.readFileSync("\\\\192.168.1.200\\Second Brain MAD\\BỘ NÃO THỨ 2 - STARTER\\_deploy-mentor-club-email-marketing\\scripts\\config.local.json", "utf8"));
const APP = "TxSrb3qKeaMqZDslH9Uln3yzgyb";
const T = "tblJLDb9fgS9Z9Ih";               // 12.1 bên MENTOR CAMP CRM

const tok = await (async () => {
  const r = await fetch(`${CFG.larkDomain}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: CFG.larkAppId, app_secret: CFG.larkAppSecret }),
  });
  return (await r.json()).tenant_access_token;
})();
const H = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };

const docCot = async () => {
  const r = await fetch(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP}/tables/${T}/fields?page_size=200`, { headers: H });
  return (await r.json()).data.items || [];
};
const themCot = async (body) => {
  const r = await fetch(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP}/tables/${T}/fields`, {
    method: "POST", headers: H, body: JSON.stringify(body),
  });
  const j = await r.json();
  return j.code === 0 ? { ok: true, id: j.data.field.field_id } : { ok: false, msg: `${j.code} ${j.msg}` };
};

// "Day 1".."Day 365" — bản mẫu dùng multi-select để đánh dấu đã gửi / đã mở ở ngày nào
const dayOpts = Array.from({ length: 365 }, (_, i) => ({ name: `Day ${i + 1}` }));

const thuong = [
  { field_name: "Mã Khách Hàng", type: 1 },
  { field_name: "Nguồn khách hàng", type: 4, property: { options: [
    { name: "Website" }, { name: "Facebook" }, { name: "Zalo" }, { name: "Sự kiện" },
    { name: "Giới thiệu" }, { name: "Nhập tay" }, { name: "Khác" },
  ] } },
  { field_name: "Lá thư gửi thành công", type: 4, property: { options: dayOpts } },
  { field_name: "Tỉ lệ mở mail", type: 4, property: { options: dayOpts } },
  { field_name: "Thời gian mở mail", type: 5, property: { date_formatter: "yyyy/MM/dd HH:mm" } },
  { field_name: "Email hỏng", type: 7 },
];

console.log("── Bước 1: cột thường ──");
let co = await docCot();
let ten = new Set(co.map((f) => f.field_name));
for (const c of thuong) {
  if (ten.has(c.field_name)) { console.log(`  = có sẵn  ${c.field_name}`); continue; }
  const r = await themCot(c);
  console.log(`  ${r.ok ? "+ thêm  " : "✘ lỗi   "} ${c.field_name}${r.ok ? "" : " → " + r.msg}`);
}

console.log("\n── Bước 2: đọc lại mã cột để viết công thức ──");
co = await docCot();
const id = {};
for (const f of co) id[f.field_name] = f.field_id;
const F = (n) => {
  if (!id[n]) throw new Error(`thiếu cột "${n}" để viết công thức`);
  return `bitable::$table[${T}].$field[${id[n]}]`;
};

// Công thức bám đúng bản mẫu, chỉ đổi mã cột sang mã của base này
const congThuc = [
  ["Chuỗi Email", `"Day "&DATEDIF(${F("Ngày bắt đầu")},TODAY(),"D")`],
  ["Số lá thư đã đọc", `COUNTA(${F("Tỉ lệ mở mail")})`],
  ["Số email đã gửi", `DAYS(TODAY(),TODATE(${F("Ngày bắt đầu")}))`],
];

console.log("\n── Bước 3: công thức nền ──");
ten = new Set(co.map((f) => f.field_name));
for (const [n, ct] of congThuc) {
  if (ten.has(n)) { console.log(`  = có sẵn  ${n}`); continue; }
  const r = await themCot({ field_name: n, type: 20, property: { formula_expression: ct } });
  console.log(`  ${r.ok ? "+ thêm  " : "✘ lỗi   "} ${n}${r.ok ? "" : " → " + r.msg}`);
}

// Nhóm sau phụ thuộc nhóm trên nên phải đọc lại mã cột lần nữa
co = await docCot();
for (const f of co) id[f.field_name] = f.field_id;
ten = new Set(co.map((f) => f.field_name));

const congThuc2 = [
  ["OpenRate – Tỉ lệ mở", `${F("Số lá thư đã đọc")}/${F("Số email đã gửi")}`],
  ["Số ngày kể từ lần mở gần nhất", `IF(ISBLANK(${F("Thời gian mở mail")}),0,IFERROR(DAYS(TODAY(),${F("Thời gian mở mail")}),-1))`],
  ["Record ID", `RECORD_ID()`],
];
console.log("\n── Bước 4: công thức tầng hai ──");
for (const [n, ct] of congThuc2) {
  if (ten.has(n)) { console.log(`  = có sẵn  ${n}`); continue; }
  const r = await themCot({ field_name: n, type: 20, property: { formula_expression: ct } });
  console.log(`  ${r.ok ? "+ thêm  " : "✘ lỗi   "} ${n}${r.ok ? "" : " → " + r.msg}`);
}

co = await docCot();
for (const f of co) id[f.field_name] = f.field_id;
ten = new Set(co.map((f) => f.field_name));

const congThuc3 = [
  ["RecencyScore_14", `IF(${F("Số ngày kể từ lần mở gần nhất")}="",0,MAX(0,1-${F("Số ngày kể từ lần mở gần nhất")}/14))`],
];
console.log("\n── Bước 5: điểm gần đây ──");
for (const [n, ct] of congThuc3) {
  if (ten.has(n)) { console.log(`  = có sẵn  ${n}`); continue; }
  const r = await themCot({ field_name: n, type: 20, property: { formula_expression: ct } });
  console.log(`  ${r.ok ? "+ thêm  " : "✘ lỗi   "} ${n}${r.ok ? "" : " → " + r.msg}`);
}

co = await docCot();
for (const f of co) id[f.field_name] = f.field_id;
ten = new Set(co.map((f) => f.field_name));

const congThuc4 = [
  ["LoyaltyScore_0_100", `ROUND(100*(0.7*${F("OpenRate – Tỉ lệ mở")}+0.3*${F("RecencyScore_14")}),0)`],
  ["Phân cấp trung thành",
`IF(${F("Số email đã gửi")}<7,"MỚI VÀO",
 IF(AND(${F("OpenRate – Tỉ lệ mở")}<0.05,${F("Số ngày kể từ lần mở gần nhất")}>30),"TỒN TẠI (Passive Presence)",
  IF(AND(${F("OpenRate – Tỉ lệ mở")}>=0.05,${F("OpenRate – Tỉ lệ mở")}<0.25,${F("Số ngày kể từ lần mở gần nhất")}<=14),"PHẢN ỨNG (Occasional)",
   IF(AND(${F("OpenRate – Tỉ lệ mở")}>=0.25,${F("OpenRate – Tỉ lệ mở")}<0.55,${F("Số ngày kể từ lần mở gần nhất")}<=14),"GẮN KẾT (Active)",
    IF(AND(${F("OpenRate – Tỉ lệ mở")}>=0.55,${F("Số ngày kể từ lần mở gần nhất")}<=7),"TÍN ĐỒ (Conversion-ready)","NGỦ ĐÔNG / LẠNH")))))`],
  ["CallToSell",
`IF(AND(${F("Số email đã gửi")}>=7,${F("Số ngày kể từ lần mở gần nhất")}<=7,${F("OpenRate – Tỉ lệ mở")}>=0.25),"ƯU TIÊN GỌI / CHỐT","NUÔI TIẾP")`],
];
console.log("\n── Bước 6: chấm điểm trung thành ──");
for (const [n, ct] of congThuc4) {
  if (ten.has(n)) { console.log(`  = có sẵn  ${n}`); continue; }
  const r = await themCot({ field_name: n, type: 20, property: { formula_expression: ct } });
  console.log(`  ${r.ok ? "+ thêm  " : "✘ lỗi   "} ${n}${r.ok ? "" : " → " + r.msg}`);
}

const cuoi = await docCot();
console.log(`\n✅ 12.1 hiện có ${cuoi.length} cột:`);
console.log("   " + cuoi.map((f) => f.field_name).join(" · "));
