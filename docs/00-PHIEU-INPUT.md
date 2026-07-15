# 00 — PHIẾU INPUT (điền xong là chạy) — Email Marketing 9 bảng

> **Ô I của ITTO**: mọi thứ CON NGƯỜI chuẩn bị **trước** khi cho hệ thống gửi mail.
> Điền hết, chạy `npm run check` xanh là xong. Chi tiết từng bước ở `docs/01→06`.

| # | Việc | Điền / xác nhận | Xong? |
|---|---|---|---|
| 1 | **Base 9 bảng** — nhân bản Base Mẫu (link `itto.yaml → input.base_mau.template_url`) | app_token = `__________` | ☐ |
| 2 | **Cấp quyền app Lark trên Base** (scope `bitable:app`) — `docs/02-cap-quyen-lark.md` | ✅ / ❌ | ☐ |
| 3 | **Lark Mail** — lấy IMAP/SMTP password — `docs/01-cau-hinh-lark-mail.md` | có password ✅ | ☐ |
| 4 | **2 Secret** GitHub: `LARK_APP_SECRET`, `SMTP_PASS` — `docs/03-github-secrets.md` | ✅ / ❌ | ☐ |
| 5 | **1 Variable** GitHub: `TRACKER_BASE_URL` (URL Worker) — `docs/04-deploy-cloudflare-worker.md` | ✅ / ❌ | ☐ |
| 6 | **Preflight**: `npm install && npm run check` → **XANH hết** (Lark · app_token · 9 bảng · SMTP) | ✅ / ❌ | ☐ |

Xanh hết → tạo cột thiếu (nếu có): `npm run setup-tables`; rồi đổ nội dung (bảng 12.1–12.4) và
bấm nút / đặt lịch (`docs/05-lark-automation-http.md`).

**Lần chạy thử an toàn:** đặt `"send": { "dryRun": true }` trong `config.local.json` → mô phỏng,
không gửi thật. Đổi `false` khi phát thật.

> `LARK_APP_ID`, `LARK_WIKI_TOKEN`, id 9 bảng, địa chỉ gửi, host SMTP/IMAP đã có **default sẵn**
> trong workflow — chỉ 2 Secret + 1 Variable ở trên là bắt buộc.
