# 05 — Gắn nút bấm / tự động trong Lark gọi HTTP

Mục tiêu: trong bảng **12.4 Email bảng tin**, khi bạn tick 1 dòng là hệ tự gửi bản tin đó tới
toàn bộ danh sách 12.3. Cơ chế: Lark Automation gửi HTTP `repository_dispatch` kèm `record_id`.

## A. Chuẩn bị bảng 12.4
Thêm 1 cột **Checkbox** tên `Gửi ngay` (hoặc dùng cột `Trạng thái` = "Chờ gửi").

## B. Tạo Automation trong Base
1. Mở Base → **Automation (Tự động hoá) → Create**.
2. **Trigger:** “When record meets condition” / “Khi ô được cập nhật” →
   Bảng 12.4, điều kiện `Gửi ngay` = ✔ (đã tick).
3. **Action:** chọn **Send request / Gửi yêu cầu HTTP**:
   - **Method:** `POST`
   - **URL:** `https://api.github.com/repos/hoangminhhoagpt-dot/mentor-club-email-marketing/dispatches`
   - **Headers:**
     ```
     Authorization: Bearer <GitHub PAT classic scope repo>
     Accept: application/vnd.github+json
     Content-Type: application/json
     ```
   - **Body (JSON):**
     ```json
     {
       "event_type": "send-newsletter",
       "client_payload": { "record_id": "{{Record ID}}" }
     }
     ```
     Trong đó `{{Record ID}}` là token “Record ID” của dòng kích hoạt (chèn từ danh sách biến của Lark).
4. Lưu & bật automation.

> Kết quả đúng: GitHub trả **204**, tab Actions chạy `send-newsletter` với đúng `record_id`.
> Script gửi xong sẽ set `Trạng thái = Đã gửi` + ghi `Đã gửi = <số người>`.

## C. Các event_type khác (tuỳ chọn nút riêng)
| event_type | Việc | client_payload hữu ích |
|---|---|---|
| `send-nurture` | Chạy drip 365 ngày (thường để cron) | `{"dry_run":"true"}` |
| `send-newsletter` | Gửi 1 bản tin theo record_id | `{"record_id":"recXXX"}` |
| `filter-fake` | Lọc mail ảo | `{"emails":"a@x.com,b@y.com"}` |
| `sync-bounces` | Quét bounce | `{"days":7}` |

## D. Mẹo bảo mật PAT
- Tạo PAT riêng cho automation này, chỉ scope `repo`.
- Nếu lộ, revoke ở GitHub và tạo lại — không cần sửa code.
- Có thể dùng token khác nhau cho từng khách khi nhân bản.
