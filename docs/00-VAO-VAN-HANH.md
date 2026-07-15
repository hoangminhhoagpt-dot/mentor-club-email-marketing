# 00 — VÀO VẬN HÀNH: các phần còn thiếu (làm theo thứ tự)

Đã xong (đã test thật): quyền Lark ✅ · 9 bảng đủ cột ✅ · gửi email thật ✅ · bounce ghi 12.8 ✅ ·
logic tracking Worker ✅. **Còn 6 phần dưới đây** để chạy hoàn toàn tự động qua HTTP từ Lark.

Giá trị dùng lại (đã biết):
- Repo: `hoangminhhoagpt-dot/mentor-club-email-marketing`
- Base app_token: `GWQgbY7t9awFlosl3k3l6OQTgzd` (đã điền sẵn vào Worker)
- Hộp thư gửi: `hoaguru2@hoangminhhoa.net` (đã là default trong workflow)

---

## A. Deploy Cloudflare Worker (tracking mở/click/huỷ — bảng 12.5/12.9/12.6)
Trên máy có Node, mở terminal **trong thư mục `worker/`**:
```bash
npm install -g wrangler
wrangler login                      # mở trình duyệt, đăng nhập Cloudflare (free)
wrangler secret put LARK_APP_SECRET # dán App Secret của app Lark khi được hỏi
wrangler deploy
```
Kết quả in ra URL: `https://mentor-club-tracker.<subdomain>.workers.dev` → **lưu lại**.

> Không có URL này thì email vẫn gửi được, nhưng KHÔNG đo được mở/click và link "Huỷ nhận" không ghi 12.6.

## B. Khai báo URL tracking
- Sửa `scripts/config.local.json` → `"tracker": { "baseUrl": "https://…workers.dev" }` (cho chạy local).
- Đặt GitHub **Variable** `TRACKER_BASE_URL` = URL đó (cho chạy trên Actions) — xem phần C.

## C. GitHub Secrets & Variables (BẮT BUỘC để Lark gọi HTTP chạy được)
Repo → **Settings → Secrets and variables → Actions**:

**Secrets** (tab Secrets):
| Tên | Giá trị |
|---|---|
| `LARK_APP_SECRET` | App Secret của app Lark |
| `SMTP_PASS` | IMAP/SMTP password của Lark Mail |

**Variables** (tab Variables):
| Tên | Giá trị |
|---|---|
| `TRACKER_BASE_URL` | URL Worker ở phần A |

> Các giá trị khác (app_id, wiki token, id 9 bảng, địa chỉ gửi, host SMTP/IMAP) đã có **default sẵn**
> trong workflow — không cần đặt. Chỉ 2 Secret + 1 Variable trên là đủ.

## D. Tạo GitHub PAT (để Lark gọi API GitHub)
GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)** →
Generate → scope **`repo`** → copy token (dùng ở phần E).

## E. Lark Automation gọi HTTP (nút + lịch)
Endpoint chung cho mọi việc:
```
POST https://api.github.com/repos/hoangminhhoagpt-dot/mentor-club-email-marketing/dispatches
Headers:
  Authorization: Bearer <PAT ở phần D>
  Accept: application/vnd.github+json
  Content-Type: application/json
```

**E1. Nút đăng bản tin (12.4):** thêm cột Checkbox `Gửi ngay` vào 12.4 → Automation:
- Trigger: khi `Gửi ngay` = ✔ (bảng 12.4).
- Action “Gửi yêu cầu HTTP” với body:
  ```json
  { "event_type": "send-newsletter", "client_payload": { "record_id": "{{Record ID}}" } }
  ```

**E2. Lịch gửi nuôi dưỡng 365 (mỗi ngày):** Automation kiểu **theo lịch** (Scheduled) chạy 08:00 mỗi ngày:
- Action “Gửi yêu cầu HTTP” body: `{ "event_type": "send-nurture" }`

**E3. (tuỳ chọn) Lịch quét bounce:** Scheduled mỗi 6h → body `{ "event_type": "sync-bounces" }`.
**E4. (tuỳ chọn) Nút lọc mail ảo:** body `{ "event_type": "filter-fake" }`.

> Gọi đúng trả **HTTP 204**; xem log ở tab **Actions** của repo.

## F. Đổ nội dung vào bảng
| Bảng | Cần điền | Điều kiện để gửi |
|---|---|---|
| 12.2 Chiến dịch 365 | `Ngày` (1..N), `Tiêu đề`, `Nội dung`, `Kích hoạt`=Bật | có nội dung ngày tương ứng |
| 12.1 Nuôi dưỡng | `Email`, `Ngày bắt đầu`, `Trạng thái`=Đang nuôi | mỗi ngày gửi bước kế tiếp |
| 12.3 DS bản tin | `Email`, `Trạng thái`=Đang nhận | nhận mọi bản tin |
| 12.4 Email bản tin | `Tiêu đề`, `Nội dung`, `Trạng thái`=Chờ gửi | bấm nút / đến lịch |

Nội dung hỗ trợ biến `{{name}}`, `{{email}}`. Có thể viết HTML.

## G. (Nên làm) Deliverability — vào inbox, không vào spam
Trong DNS của `hoangminhhoa.net`, đảm bảo đã có **SPF + DKIM + DMARC** mà Lark Mail cung cấp khi
thêm tên miền (Lark Admin → Mail → Domain). Thiếu DKIM/SPF → dễ vào spam khi gửi số lượng.

## H. Nghiệm thu cuối
1. Đổ vài dòng test (1 bản tin ở 12.4 + email của bạn ở 12.3).
2. Bấm `Gửi ngay` (E1) hoặc gọi HTTP `send-newsletter` → nhận email.
3. Mở email + bấm link → kiểm tra dòng mới ở **12.5** (mở) và **12.9** (click); bấm "Huỷ nhận" → **12.6**.
4. `send-nurture` gọi mỗi ngày sẽ tự đẩy từng bước cho người "Đang nuôi".
