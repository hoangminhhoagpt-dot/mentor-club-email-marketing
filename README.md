# Mentor Club — Hệ thống Email Marketing trên Lark Base

Vận hành **9 bảng Email Marketing** (12.1 → 12.9) bằng script Node chạy trên **GitHub Actions**,
kích hoạt qua **HTTP** (`repository_dispatch`) hoặc cron. Gửi email qua **Gmail SMTP**; tracking
mở/click/huỷ nhận qua một **Cloudflare Worker** nhỏ; bắt mail lỗi (bounce) qua **IMAP**.

> Không cần bật máy, không cần server riêng. Bấm nút trong Lark hoặc để cron tự chạy.

## 9 bảng & script phụ trách

| Bảng | Vai trò | Được xử lý bởi |
|---|---|---|
| 12.1 Danh sách Email Nuôi Dưỡng | Người nhận drip 365 ngày | `send-nurture.mjs` |
| 12.2 Chiến dịch Email 365 ngày | Nội dung theo từng ngày 1..365 | `send-nurture.mjs` |
| 12.3 Danh sách Email bảng tin | Người nhận bản tin | `send-newsletter.mjs` |
| 12.4 Email bảng tin | Nội dung bản tin (gửi theo nút/lịch) | `send-newsletter.mjs` |
| 12.5 Báo cáo đọc Email | Lượt **mở** (pixel) | Cloudflare Worker `/o` |
| 12.6 Huỷ nhận email | Người **huỷ nhận** | Worker `/u` + suppression |
| 12.7 Lọc mail ảo | Kiểm cú pháp + MX + disposable | `filter-fake.mjs` |
| 12.8 Danh sách mail lỗi | **Bounce** từ Gmail | `sync-bounces.mjs` (IMAP) |
| 12.9 Danh sách email click link | Lượt **click** link | Worker `/c` |

## Kiến trúc 1 phút

```
                 ┌─ cron / HTTP dispatch ─┐
   Lark (nút) ─▶ GitHub Actions ─▶ Node scripts ─▶ Gmail SMTP ─▶ Người nhận
                                     │  ▲                            │ mở/click
                        đọc/ghi 9 bảng│  │ suppression (12.6/12.7/12.8) │
                                     ▼  │                            ▼
                                 Lark Base ◀──── Cloudflare Worker (/o /c /u) ◀── pixel & link
                                     ▲
                          bounce ────┘  sync-bounces.mjs ◀── IMAP Gmail
```

## Cài đặt (làm 1 lần)

Theo thứ tự, mỗi bước có file hướng dẫn trong `docs/`:

1. **`docs/02-cap-quyen-lark.md`** — Cấp quyền app Lark trên Base + scope `wiki:node:read`, `bitable:app`.
2. **`docs/01-cau-hinh-gmail-smtp.md`** — Bật 2FA + tạo **App Password** cho Gmail (SMTP + IMAP).
3. Chạy `npm install` rồi `cp scripts/config.example.json scripts/config.local.json`, điền vào.
4. `node scripts/check-setup.mjs` → phải xanh hết (Lark, app_token, 9 bảng, SMTP).
5. `node scripts/setup-tables.mjs` → tạo các cột còn thiếu trong 9 bảng.
6. **`docs/04-deploy-cloudflare-worker.md`** — Deploy Worker, lấy URL, điền `tracker.baseUrl`.
7. **`docs/03-github-secrets.md`** — Đưa code lên GitHub, đặt Secrets/Variables.
8. **`docs/05-lark-automation-http.md`** — Gắn nút bấm trong Lark gọi HTTP (đăng bản tin).

Schema chi tiết từng bảng: **`docs/06-schema-9-bang.md`**.

## Chạy thử nhanh (máy cá nhân)

```bash
npm install
# mô phỏng gửi (không gửi thật): đặt "send.dryRun": true trong config.local.json
node scripts/send-nurture.mjs
node scripts/filter-fake.mjs
node scripts/sync-bounces.mjs
```

## Gọi qua HTTP (từ Lark / Postman / curl)

```
POST https://api.github.com/repos/hoangminhhoagpt-dot/mentor-club-email-marketing/dispatches
Authorization: Bearer <GitHub PAT classic, scope repo>
Accept: application/vnd.github+json
Content-Type: application/json

{ "event_type": "send-newsletter", "client_payload": { "record_id": "recXXXX" } }
```
Trả **HTTP 204** = đã nhận. Xem kết quả ở tab **Actions**. Các `event_type`:
`send-nurture` · `send-newsletter` · `filter-fake` · `sync-bounces`.

## Lưu ý quan trọng

- **Gmail có giới hạn gửi** (~500/ngày cá nhân, ~2.000/ngày Workspace) và dễ vào spam nếu gửi
  marketing số lượng lớn. Script đã throttle + tôn trọng huỷ nhận/bounce, nhưng để gửi lớn nên
  cân nhắc tên miền riêng + SPF/DKIM, hoặc chuyển sang ESP (Brevo/SendGrid) sau này.
- **Bí mật** (app secret, mật khẩu ứng dụng Gmail) chỉ nằm trong `config.local.json` (đã .gitignore)
  và **GitHub Secrets** — không bao giờ commit.
- Mọi tên cột có thể đổi trong `config.local.json → fields` nếu bảng thật của bạn khác mặc định.
