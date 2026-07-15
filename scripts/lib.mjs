/**
 * mentor-club-email-marketing — thư viện dùng chung.
 * Config loader (JSON + ENV) · Lark Base REST helpers · schema 9 bảng · token tracking.
 *
 * Mọi giá trị BÍ MẬT (app_secret, mật khẩu SMTP/IMAP) chỉ đọc từ ENV hoặc config.local.json
 * (đã .gitignore). KHÔNG hardcode secret trong file này.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG = path.join(__dirname, "config.local.json");
export const ITTO_PATH = path.join(__dirname, "..", "itto.yaml");

/** Đọc hợp đồng itto.yaml (cần gói 'yaml' → npm install). */
export async function loadItto(p = ITTO_PATH) {
  let YAML;
  try { YAML = (await import("yaml")).default; }
  catch { throw new Error("chưa cài gói 'yaml' — chạy `npm install` trước"); }
  return YAML.parse(fs.readFileSync(p, "utf8"));
}

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
export function loadConfig(configPath = DEFAULT_CONFIG) {
  let CFG = {};
  try { CFG = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch { /* CI: dùng ENV */ }
  const E = process.env;
  CFG.__path = configPath;

  CFG.larkDomain    = E.LARK_DOMAIN     || CFG.larkDomain || "https://open.larksuite.com";
  CFG.larkAppId     = E.LARK_APP_ID     || CFG.larkAppId;
  CFG.larkAppSecret = E.LARK_APP_SECRET || CFG.larkAppSecret;
  CFG.wikiToken     = E.LARK_WIKI_TOKEN || CFG.wikiToken;
  CFG.appToken      = E.LARK_APP_TOKEN  || CFG.appToken;

  CFG.tables = CFG.tables || {};
  const T = CFG.tables;
  T.nurtureList    = E.TABLE_NURTURE     || T.nurtureList;
  T.campaign365    = E.TABLE_CAMPAIGN    || T.campaign365;
  T.newsletterList = E.TABLE_NL_LIST     || T.newsletterList;
  T.newsletterMail = E.TABLE_NL_MAIL     || T.newsletterMail;
  T.openReport     = E.TABLE_OPEN        || T.openReport;
  T.unsubscribe    = E.TABLE_UNSUB       || T.unsubscribe;
  T.fakeFilter     = E.TABLE_FAKE        || T.fakeFilter;
  T.errorList      = E.TABLE_ERROR       || T.errorList;
  T.clickList      = E.TABLE_CLICK       || T.clickList;

  CFG.smtp = CFG.smtp || {};
  const S = CFG.smtp;
  S.host      = E.SMTP_HOST       || S.host || "smtp.larksuite.com";
  S.port      = Number(E.SMTP_PORT || S.port || 465);
  S.secure    = (E.SMTP_SECURE != null ? E.SMTP_SECURE === "true" : (S.secure != null ? S.secure : true));
  S.user      = E.SMTP_USER       || S.user;
  S.pass      = E.SMTP_PASS       || S.pass;
  S.fromName  = E.SMTP_FROM_NAME  || S.fromName  || "Mentor Club";
  S.fromEmail = E.SMTP_FROM_EMAIL || S.fromEmail || S.user;

  CFG.imap = CFG.imap || {};
  const I = CFG.imap;
  I.host = E.IMAP_HOST || I.host || "imap.larksuite.com";
  I.port = Number(E.IMAP_PORT || I.port || 993);
  I.user = E.IMAP_USER || I.user || S.user;
  I.pass = E.IMAP_PASS || I.pass || S.pass;

  CFG.tracker = CFG.tracker || {};
  CFG.tracker.baseUrl = (E.TRACKER_BASE_URL || CFG.tracker.baseUrl || "").replace(/\/+$/, "");

  CFG.send = CFG.send || {};
  CFG.send.perRunLimit = Number(E.SEND_PER_RUN_LIMIT || CFG.send.perRunLimit || 200);
  CFG.send.delayMs     = Number(E.SEND_DELAY_MS      || CFG.send.delayMs     || 1500);
  CFG.send.dryRun      = (E.DRY_RUN != null ? E.DRY_RUN === "true" : !!CFG.send.dryRun);

  CFG.fields = CFG.fields || {};
  return CFG;
}

export function requireKeys(CFG, keys) {
  const miss = [];
  for (const k of keys) {
    const v = k.split(".").reduce((o, kk) => (o == null ? o : o[kk]), CFG);
    if (!v) miss.push(k);
  }
  if (miss.length) {
    console.error(`❌ Thiếu cấu hình: ${miss.join(", ")} (điền config.local.json hoặc set ENV / GitHub Secrets).`);
    process.exit(1);
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nowMs = () => Date.now();
export const normEmail = (s) => String(s || "").trim().toLowerCase();

// ---------------------------------------------------------------------------
// SCHEMA — nguồn sự thật cho 9 bảng (12.1 → 12.9).
// key   = tên logic dùng trong code
// name  = tên CỘT mặc định trên Lark (config.fields[table][key] có thể ghi đè)
// type  = mã kiểu trường Lark (dùng bởi setup-tables.mjs để tạo cột còn thiếu)
// opts  = danh sách lựa chọn cho SingleSelect
// ---------------------------------------------------------------------------
export const SCHEMA = {
  nurtureList: {          // 12.1 Danh sách Email Nuôi Dưỡng
    email:      { name: "Email",              type: 1 },
    name:       { name: "Tên",                type: 1 },
    startDate:  { name: "Ngày bắt đầu",       type: 5 },
    status:     { name: "Trạng thái",         type: 3, opts: ["Đang nuôi", "Tạm dừng", "Hoàn thành", "Đã huỷ"] },
    lastStep:   { name: "Bước gần nhất",      type: 2 },
    lastSentAt: { name: "Lần gửi gần nhất",   type: 5 },
    note:       { name: "Ghi chú",            type: 1 },
  },
  campaign365: {          // 12.2 Chiến dịch Email 365 ngày
    day:     { name: "Ngày",      type: 2 },
    subject: { name: "Tiêu đề",   type: 1 },
    body:    { name: "Nội dung",  type: 1 },
    active:  { name: "Kích hoạt", type: 3, opts: ["Bật", "Tắt"] },
  },
  newsletterList: {       // 12.3 Danh sách Email bảng tin
    email:        { name: "Email",         type: 1 },
    name:         { name: "Tên",           type: 1 },
    subscribedAt: { name: "Ngày đăng ký",  type: 5 },
    status:       { name: "Trạng thái",    type: 3, opts: ["Đang nhận", "Đã huỷ"] },
    source:       { name: "Nguồn",         type: 1 },
    note:         { name: "Ghi chú",       type: 1 },
  },
  newsletterMail: {       // 12.4 Email bảng tin
    subject:     { name: "Tiêu đề",       type: 1 },
    body:        { name: "Nội dung",      type: 1 },
    status:      { name: "Trạng thái",    type: 3, opts: ["Nháp", "Chờ gửi", "Đang gửi", "Đã gửi"] },
    scheduledAt: { name: "Lịch gửi",      type: 5 },
    sentCount:   { name: "Đã gửi",        type: 2 },
    sentAt:      { name: "Ngày gửi thực", type: 5 },
  },
  openReport: {           // 12.5 Báo cáo đọc Email
    email:       { name: "Email",       type: 1 },
    campaign:    { name: "Chiến dịch",  type: 1 },
    step:        { name: "Bước",        type: 1 },
    firstOpenAt: { name: "Mở lần đầu",  type: 5 },
    lastOpenAt:  { name: "Mở gần nhất", type: 5 },
    openCount:   { name: "Số lần mở",   type: 2 },
    userAgent:   { name: "Thiết bị",    type: 1 },
  },
  unsubscribe: {          // 12.6 Huỷ nhận email
    email:    { name: "Email",          type: 1 },
    unsubAt:  { name: "Thời gian huỷ",  type: 5 },
    source:   { name: "Nguồn",          type: 3, opts: ["Link", "One-click", "Trả lời", "Thủ công"] },
    campaign: { name: "Chiến dịch",     type: 1 },
  },
  fakeFilter: {           // 12.7 Lọc mail ảo
    email:      { name: "Email",               type: 1 },
    result:     { name: "Kết quả",             type: 3, opts: ["Hợp lệ", "Không hợp lệ", "Nghi ngờ"] },
    reason:     { name: "Lý do",               type: 1 },
    hasMx:      { name: "Có MX",               type: 7 },
    disposable: { name: "Dùng 1 lần",          type: 7 },
    checkedAt:  { name: "Thời gian kiểm tra",  type: 5 },
  },
  errorList: {            // 12.8 Danh sách mail lỗi
    email:      { name: "Email",       type: 1 },
    errorType:  { name: "Loại lỗi",    type: 3, opts: ["Hard bounce", "Soft bounce", "Từ chối", "Khác"] },
    detail:     { name: "Chi tiết",    type: 1 },
    campaign:   { name: "Chiến dịch",  type: 1 },
    occurredAt: { name: "Thời gian",   type: 5 },
  },
  clickList: {            // 12.9 Danh sách email click link
    email:        { name: "Email",         type: 1 },
    campaign:     { name: "Chiến dịch",    type: 1 },
    step:         { name: "Bước",          type: 1 },
    url:          { name: "Link đích",     type: 15 },
    firstClickAt: { name: "Nhấp lần đầu",  type: 5 },
    lastClickAt:  { name: "Nhấp gần nhất", type: 5 },
    clickCount:   { name: "Số lần nhấp",   type: 2 },
  },
};

/** Tên cột thực tế cho 1 trường logic (ưu tiên override trong config.fields). */
export function F(CFG, tableKey, logical) {
  const ov = CFG.fields?.[tableKey]?.[logical];
  if (ov) return ov;
  const s = SCHEMA[tableKey]?.[logical];
  if (!s) throw new Error(`Không có trường "${logical}" trong bảng "${tableKey}"`);
  return s.name;
}

// ---------------------------------------------------------------------------
// TRACKING TOKEN — gói {e:email, c:campaign, s:step} thành base64url để nhét vào URL.
// Worker Cloudflare giải mã ngược lại. Không phải secret, chỉ để định danh lượt mở/click.
// ---------------------------------------------------------------------------
export function encodeToken({ e, c, s }) {
  const json = JSON.stringify({ e: normEmail(e), c: c || "", s: s || "" });
  return Buffer.from(json, "utf8").toString("base64url");
}
export function decodeToken(tok) {
  try { return JSON.parse(Buffer.from(String(tok), "base64url").toString("utf8")); }
  catch { return null; }
}

// ---------------------------------------------------------------------------
// LARK BASE REST
// ---------------------------------------------------------------------------
let TOKEN = null, TOKEN_EXP = 0;
export async function larkToken(CFG) {
  if (TOKEN && Date.now() < TOKEN_EXP) return TOKEN;
  requireKeys(CFG, ["larkAppId", "larkAppSecret"]);
  const r = await fetch(`${CFG.larkDomain}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: CFG.larkAppId, app_secret: CFG.larkAppSecret }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Lark token lỗi: ${j.code} ${j.msg}`);
  TOKEN = j.tenant_access_token; TOKEN_EXP = Date.now() + (j.expire - 120) * 1000;
  return TOKEN;
}

export async function larkApi(CFG, method, apiPath, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = await larkToken(CFG);
    const r = await fetch(`${CFG.larkDomain}${apiPath}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json();
    if (j.code === 0) return j.data;
    if (j.code === 99991663 || j.code === 99991661) { TOKEN = null; continue; }        // token hết hạn
    if (r.status === 429 || j.code === 1254607 || j.code === 1254045) { await sleep(1200 * (attempt + 1)); continue; }
    throw new Error(`Lark ${apiPath} lỗi: ${j.code} ${j.msg}`);
  }
  throw new Error(`Lark ${apiPath}: hết lượt thử.`);
}

/** Resolve wiki node token → bitable app_token (cache vào CFG.appToken). Cần scope wiki:node:read. */
export async function resolveAppToken(CFG) {
  if (CFG.appToken) return CFG.appToken;
  requireKeys(CFG, ["wikiToken"]);
  const data = await larkApi(CFG, "GET",
    `/open-apis/wiki/v2/spaces/get_node?token=${CFG.wikiToken}&obj_type=wiki`);
  const obj = data?.node?.obj_token;
  if (!obj) throw new Error("Không resolve được wiki token → app_token. Kiểm tra quyền app trên Base.");
  CFG.appToken = obj;
  return obj;
}

export async function listAllRecords(CFG, tableId, { filter, viewId } = {}) {
  const app = await resolveAppToken(CFG);
  const out = []; let pageToken = null;
  do {
    const qs = new URLSearchParams({ page_size: "500" });
    if (pageToken) qs.set("page_token", pageToken);
    if (filter) qs.set("filter", filter);
    if (viewId) qs.set("view_id", viewId);
    const data = await larkApi(CFG, "GET",
      `/open-apis/bitable/v1/apps/${app}/tables/${tableId}/records?${qs}`);
    out.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token : null;
  } while (pageToken);
  return out;
}

export async function createRecord(CFG, tableId, fields) {
  const app = await resolveAppToken(CFG);
  const data = await larkApi(CFG, "POST",
    `/open-apis/bitable/v1/apps/${app}/tables/${tableId}/records`, { fields });
  return data.record;
}
export async function updateRecord(CFG, tableId, recordId, fields) {
  const app = await resolveAppToken(CFG);
  const data = await larkApi(CFG, "PUT",
    `/open-apis/bitable/v1/apps/${app}/tables/${tableId}/records/${recordId}`, { fields });
  return data.record;
}
/** Tạo nhiều bản ghi 1 lần (tối đa 500/lần). records = [{fields}, ...] */
export async function batchCreate(CFG, tableId, records) {
  const app = await resolveAppToken(CFG);
  const out = [];
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    const data = await larkApi(CFG, "POST",
      `/open-apis/bitable/v1/apps/${app}/tables/${tableId}/records/batch_create`, { records: chunk });
    out.push(...(data.records || []));
  }
  return out;
}

/** Liệt kê field của 1 bảng. */
export async function listFields(CFG, tableId) {
  const app = await resolveAppToken(CFG);
  const data = await larkApi(CFG, "GET",
    `/open-apis/bitable/v1/apps/${app}/tables/${tableId}/fields?page_size=200`);
  return data.items || [];
}
