# Mentor Club — Hệ thống Email Marketing trên Lark Base (9 bảng 12.1 → 12.9)

Hệ email marketing **trọn gói** chạy ngay trên Lark Base: nuôi dưỡng 365 ngày, gửi bản tin,
đo mở/click, lọc mail ảo, quét mail lỗi (bounce) — gửi qua **Lark Mail**, chạy trên **GitHub Actions**,
kích hoạt **CHỈ bằng HTTP** từ Lark. Người không biết code vẫn vận hành được vì mọi thứ nằm trên bảng.

> Không cần bật máy, không cần server riêng. Lark gọi HTTP là chạy. Muốn chạy định kỳ thì đặt lịch
> bằng **Lark Automation** — quyền điều khiển nằm trên Lark, **không giấu cron trong repo**.

---

## Mục đích

Một đường ống email marketing đủ hai chiều — **gửi ra** (nuôi dưỡng + bản tin) và **thu ngược**
(mở, click, huỷ nhận, mail lỗi) — với toàn bộ dữ liệu và nội dung quản trên Lark Base.
Repo này lo **đường ống gửi và đo**; nội dung do bạn đổ vào bảng 12.2 / 12.4.

## Làm được gì — 9 bảng 12.1 → 12.9

| Nhóm | Bảng | Vai trò | Được xử lý bởi |
|---|---|---|---|
| **Gửi ra** | 12.1 Danh sách Email Nuôi Dưỡng | Người nhận chuỗi drip 365 ngày | `send-nurture.mjs` |
| | 12.2 Chiến dịch Email 365 ngày | Nội dung theo từng ngày 1..365 | `send-nurture.mjs` |
| | 12.3 Danh sách Email bảng tin | Người nhận bản tin | `send-newsletter.mjs` |
| | 12.4 Email bảng tin | Nội dung bản tin (gửi theo nút / lịch) | `send-newsletter.mjs` |
| **Thu ngược** | 12.5 Báo cáo đọc Email | Lượt **mở** (pixel) | Cloudflare Worker `/o` |
| | 12.9 Danh sách email click link | Lượt **click** link | Cloudflare Worker `/c` |
| | 12.6 Huỷ nhận email | Người **huỷ nhận** | Worker `/u` + suppression |
| **Làm sạch** | 12.7 Lọc mail ảo | Kiểm cú pháp + MX + disposable | `filter-fake.mjs` |
| | 12.8 Danh sách mail lỗi | **Bounce** từ hộp thư | `sync-bounces.mjs` (IMAP) |

Trước mỗi lần gửi, hệ tự loại người có trong **12.6 (huỷ) + 12.7 (ảo) + 12.8 (lỗi)** — gọi là *suppression*.

## Kiến trúc 1 phút

```
Lark Automation (nút bấm / đặt lịch)
   └─ HTTP repository_dispatch ─→ GitHub Actions ─→ script Node ─→ Lark Mail SMTP ─→ hộp thư người nhận
                                                       │
                              email chèn link /o /c /u ─→ Cloudflare Worker ─→ ghi thẳng Lark 12.5 / 12.9 / 12.6
                                                       │
                                     IMAP quét mail trả về ─→ 12.8 (bounce)
```

**Chạy THEO YÊU CẦU** — không tiến trình nền, **không cron GitHub**. Lịch hằng ngày đặt bằng Lark Automation.

## Bốn điểm bấm (event_type)

| event_type | Script | Việc |
|---|---|---|
| `send-nurture` | `scripts/send-nurture.mjs` | Drip 365 ngày: 12.2 → 12.1, mỗi người 1 email/ngày theo `Bước gần nhất + 1` |
| `send-newsletter` | `scripts/send-newsletter.mjs` | Gửi bản tin 12.4 → 12.3 theo `record_id` (nút bấm) |
| `filter-fake` | `scripts/filter-fake.mjs` | Lọc mail ảo (cú pháp + MX + disposable) → 12.7 |
| `sync-bounces` | `scripts/sync-bounces.mjs` | Quét IMAP tìm mail trả về → 12.8 |

## Hợp đồng ITTO

Nguồn sự thật ở [`itto.yaml`](itto.yaml). `npm run check` soát cả hợp đồng này.

- **Input**: Base 9 bảng (nhân bản Base Mẫu) · app Lark có scope `bitable:app` **và quyền SỬA** trên Base ·
  Lark Mail IMAP/SMTP password · (tuỳ chọn) Cloudflare Worker để đo mở/click.
- **Tech**: Lark Base · Lark Mail SMTP `smtp.larksuite.com:465` / IMAP `imap.larksuite.com:993` ·
  Cloudflare Worker · GitHub Actions.
- **Tool**: 4 event_type ở trên (HTTP `repository_dispatch`).
- **Output**: ghi ngược 12.5 / 12.6 / 12.8 / 12.9; 12.4 cập nhật trạng thái/đã gửi; 12.1 cập nhật bước gần nhất.

## Bí mật & biến

| Loại | Tên | Là gì |
|---|---|---|
| **Secret** | `LARK_APP_SECRET` | App Secret của app Lark |
| **Secret** | `SMTP_PASS` | IMAP/SMTP password của Lark Mail (KHÔNG phải mật khẩu đăng nhập) |
| **Variable** | `TRACKER_BASE_URL` | URL Cloudflare Worker (tracking mở/click/huỷ) |

> **Đọc kỹ nếu bạn là KHÁCH MỚI (base riêng):** các workflow có **giá trị mặc định cứng trỏ về base gốc**.
> Chỉ đặt 2 Secret + 1 Variable là **đúng với base gốc**, còn base của bạn thì Actions sẽ chạy vào base
> người khác → **báo success mà gửi 0 email, không lỗi nào hiện ra**. Vì vậy base mới **bắt buộc** đặt thêm
> Variable: `LARK_APP_TOKEN` (then chốt nhất) + `TABLE_NURTURE`, `TABLE_CAMPAIGN`, `TABLE_NL_LIST`,
> `TABLE_NL_MAIL`, `TABLE_UNSUB`, `TABLE_ERROR`, `TABLE_FAKE`. Dùng hộp thư khác thì thêm
> `SMTP_USER`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`. (Xem [`docs/07-PROMPT-TRIEN-KHAI.md`](docs/07-PROMPT-TRIEN-KHAI.md).)

Bí mật **không bao giờ** nằm trong repo — chỉ ở `scripts/config.local.json` (đã `.gitignore`) hoặc GitHub Secrets.

---

## Cài đặt cho khách mới

**Đường nhanh:** làm theo [`docs/00-PHIEU-INPUT.md`](docs/00-PHIEU-INPUT.md) — điền phiếu rồi:

```bash
node check-itto.mjs            # cổng chốt zero-dep: soát hợp đồng ITTO (chạy được khi chưa cài)
npm install && npm run check   # soát quyền Lark · 9 bảng đủ cột · đăng nhập SMTP
```

**Muốn Claude tự làm hết:** dán khối lệnh trong [`docs/07-PROMPT-TRIEN-KHAI.md`](docs/07-PROMPT-TRIEN-KHAI.md).

**Làm tay theo thứ tự** (mỗi bước có file trong `docs/`):

1. **Nhân bản Base Mẫu** — mở [Base Mẫu](https://studiosuccess.sg.larksuite.com/base/ZM8qbz78JaR16Es560sly6Bkgvg)
   → góc trên phải `...` → **Tạo bản sao / Make a copy**. Lấy `app_token` là đoạn sau `/base/` trong URL bản sao.
2. **Cấp quyền app Lark** trên Base — [`docs/02-cap-quyen-lark.md`](docs/02-cap-quyen-lark.md).
   App phải là **cộng tác viên có quyền SỬA**; chỉ có quyền đọc thì ghi record sẽ lỗi `91403`.
3. **Lấy IMAP/SMTP password** của Lark Mail — [`docs/01-cau-hinh-lark-mail.md`](docs/01-cau-hinh-lark-mail.md).
4. `cp scripts/config.example.json scripts/config.local.json` rồi điền (app_token, secret, mật khẩu mail).
5. **Dựng/bù bảng:** `node scripts/setup-tables.mjs --base <app_token-cua-ban-sao>`.
   Idempotent hai tầng — bảng **chưa có** thì tạo mới kèm đủ cột; bảng **đã có** thì chỉ thêm cột thiếu,
   không đụng dữ liệu. Cuối lệnh in sẵn khối JSON `tables` để dán vào config.
6. **Preflight:** `npm run check` → phải **xanh hết** (Lark · app_token · 9 bảng · SMTP). *Đỏ ở đâu sửa ở đó rồi mới đi tiếp.*
7. **Tracking (nếu cần đo mở/click):** deploy `worker/tracker.js` — [`docs/04-deploy-cloudflare-worker.md`](docs/04-deploy-cloudflare-worker.md).
8. **Đưa lên GitHub + đặt Secrets/Variables** — [`docs/03-github-secrets.md`](docs/03-github-secrets.md)
   (nhớ mục *Bí mật & biến* ở trên: base mới phải đặt thêm `LARK_APP_TOKEN` + các `TABLE_*`).
9. **Gắn nút bấm trên Lark** gọi HTTP — [`docs/05-lark-automation-http.md`](docs/05-lark-automation-http.md).

**Chạy thử AN TOÀN trước khi phát thật:** đặt `"send": { "dryRun": true }` trong `config.local.json`
(hoặc chạy workflow với `dry_run=true`) → mô phỏng toàn bộ, **không gửi thật**. Xem log hợp lý rồi mới đổi `false`.

Schema chi tiết từng cột: [`docs/06-schema-9-bang.md`](docs/06-schema-9-bang.md).
Checklist vào vận hành: [`docs/00-VAO-VAN-HANH.md`](docs/00-VAO-VAN-HANH.md).

## Bốn cái bẫy (đã làm hỏng thật ít nhất một lần — nhớ để tránh)

| # | Bẫy | Hậu quả nếu quên |
|---|---|---|
| 1 | `worker/wrangler.toml` hard-code base/table id | Tracking khách A ghi nhầm vào base khách B |
| 2 | `wrangler` lỗi trên đường dẫn mạng UNC (`\\...`) trên Windows | Deploy fail khó hiểu — chép `worker/` ra thư mục local rồi deploy |
| 3 | Deploy Cloudflare không tức thì | Kiểm quá sớm (< 30–60s) → thấy bản cũ, tưởng hỏng |
| 4 | Workflow có **default cứng trỏ base gốc** | **Actions báo success mà gửi 0 email** — im lặng, không log lỗi |

Bẫy 4 nguy hiểm nhất vì nó *im lặng*. Đọc log `send-nurture` và nhìn con số **"bỏ qua"**:
`bỏ qua 0` = không thấy dòng người nhận nào → **sai base / bảng rỗng**; `bỏ qua N>0` (hoặc có dòng
`(dry-run) Ngày X → email`) = đọc đúng base. **Xem con số này trước khi nghi SMTP.**

## Gọi qua HTTP (từ Lark / Postman / curl)

```
POST https://api.github.com/repos/hoangminhhoagpt-dot/mentor-club-email-marketing/dispatches
Authorization: Bearer <GitHub PAT classic, scope repo>
Accept: application/vnd.github+json
Content-Type: application/json

{ "event_type": "send-newsletter", "client_payload": { "record_id": "recXXXX" } }
```

Trả **HTTP 204** = đã nhận. Xem kết quả ở tab **Actions**.
event_type: `send-nurture` · `send-newsletter` · `filter-fake` · `sync-bounces`.

## Lưu ý quan trọng

- **Số liệu MỞ (12.5) chỉ để tham khảo.** Apple Mail Privacy Protection + proxy ảnh của Gmail/Outlook tự
  tải pixel như thể người thật đã mở. Worker đã lọc phần lớn máy quét, nhưng muốn đo *thật* thì **tin CLICK (12.9)**.
- **Bounce của Lark Mail KHÔNG theo chuẩn DSN** — địa chỉ hỏng nằm trong dòng chữ `Email delivery failed <email>`
  ở phần text/plain, from `mailer-daemon@larksuite.com`. `sync-bounces.mjs` đã có regex fallback.
- **SPF / DKIM / DMARC** cho tên miền gửi là bắt buộc. Bỏ qua thì thư vào spam mà log vẫn báo gửi thành công —
  kiểu hỏng khó phát hiện nhất của cả bộ.
- **Lark Mail có giới hạn gửi/ngày.** Script đã throttle + tôn trọng suppression. Quy mô rất lớn thì chuyển
  sang ESP (Brevo/SendGrid) sau — chỉ đổi `scripts/email.mjs`.
- **Cột chính (primary) của Lark không nhận Select/URL/Checkbox/Attachment** — phải là Text. Code truy cột
  **theo tên** nên đổi thứ tự vô hại; đổi *tên* cột thì khai lại ở `config.local.json → fields`.

## Tham chiếu

- [`itto.yaml`](itto.yaml) — hợp đồng ITTO (nguồn sự thật: bảng, secret, biến, 4 event, link Base Mẫu).
- [`docs/00-PHIEU-INPUT.md`](docs/00-PHIEU-INPUT.md) — phiếu điền trước khi chạy ·
  [`docs/00-VAO-VAN-HANH.md`](docs/00-VAO-VAN-HANH.md) — checklist vào vận hành.
- [`docs/01`](docs/01-cau-hinh-lark-mail.md)→[`06`](docs/06-schema-9-bang.md) — Lark Mail · cấp quyền · GitHub Secrets · Worker · Lark Automation · schema 9 bảng.
- [`docs/07-PROMPT-TRIEN-KHAI.md`](docs/07-PROMPT-TRIEN-KHAI.md) — prompt để Claude tự triển khai cho khách/máy mới.

<details>
<summary><b>Bản gốc tham chiếu</b> (deploy đầu tiên — khách mới sẽ có id khác sau khi nhân bản)</summary>

Base: `https://studiosuccess.sg.larksuite.com/wiki/Sm0TwzxpUia6pWkRGCClLfnwgrf` · 9 bảng:

| Bảng | table_id |
|---|---|
| 12.1 Danh sách Email Nuôi Dưỡng | `tbltZ1K0MEVMA0hD` |
| 12.2 Chiến dịch Email 365 ngày | `tblSpd0cH3yVczMl` |
| 12.3 Danh sách Email bảng tin | `tbls6oZoxfUxZvkO` |
| 12.4 Email bảng tin | `tblykPorYc7WR7Ss` |
| 12.5 Báo cáo đọc Email | `tblvxxe82dGYQXQv` |
| 12.6 Huỷ nhận email | `tbldkFroNQJXjZRV` |
| 12.7 Lọc mail ảo | `tblZHQX8FrGp1kPf` |
| 12.8 Danh sách mail lỗi | `tblNgcFWWyWI7erZ` |
| 12.9 Danh sách email click link | `tblw20eIsnURSIxC` |

Các id này chỉ là ví dụ của deploy gốc. **Khách mới không dùng lại** — sau khi nhân bản Base Mẫu và chạy
`setup-tables.mjs`, mỗi bảng có id riêng; lấy id thật từ khối JSON `tables` mà lệnh in ra, hoặc từ `check-setup`.
</details>
