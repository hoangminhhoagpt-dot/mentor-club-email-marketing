# 01 — Cấu hình Lark Mail (SMTP gửi + IMAP đọc bounce)

Hệ thống gửi email bằng **hộp thư Lark Mail** trên tên miền riêng (vd `@hoangminhhoa.net`),
qua giao thức SMTP/IMAP tiêu chuẩn. Không dùng mật khẩu đăng nhập Lark — dùng **IMAP/SMTP
password** riêng do Lark Mail cấp.

## Thông số máy chủ (Lark Mail)
| | Địa chỉ | Cổng |
|---|---|---|
| SMTP (gửi) | `smtp.larksuite.com` | **465** (SSL) hoặc 587 (STARTTLS) |
| IMAP (đọc) | `imap.larksuite.com` | **993** (SSL) |

Hệ dùng mặc định **465 SSL** (`secure: true`). Nếu muốn STARTTLS thì đặt `smtp.port=587`,
`smtp.secure=false`.

## Lấy IMAP/SMTP password
1. Đăng nhập hộp thư trên **mail.larksuite.com** (hoặc trong app Lark → Mail).
2. **Settings → IMAP/SMTP** (Cấu hình IMAP/SMTP) → bật dịch vụ → **tạo mật khẩu ứng dụng**.
3. Lark hiện một chuỗi mật khẩu 16 ký tự. Đây là giá trị điền vào `smtp.pass` và `imap.pass`.

> Mật khẩu này **là bí mật** — chỉ để trong `config.local.json` (đã .gitignore) và GitHub Secrets.

## Điền vào config (`scripts/config.local.json`)
```json
"smtp": {
  "host": "smtp.larksuite.com", "port": 465, "secure": true,
  "user": "hoaguru2@hoangminhhoa.net",
  "pass": "<IMAP/SMTP password>",
  "fromName": "Mentor Club",
  "fromEmail": "hoaguru2@hoangminhhoa.net"
},
"imap": { "host": "imap.larksuite.com", "port": 993, "user": "hoaguru2@hoangminhhoa.net", "pass": "<IMAP/SMTP password>" }
```
> `fromEmail` **phải** là chính địa chỉ hộp thư đã xác thực, nếu không Lark từ chối gửi.

## Kiểm tra
```bash
node scripts/check-setup.mjs
```
Dòng `✔ SMTP đăng nhập (...)` là đạt. (Đã test thực tế: login SMTP + IMAP tới Lark Mail thành công.)

## Giới hạn & deliverability
- Lark Mail có giới hạn số thư gửi/ngày theo gói và chính sách chống spam; gửi marketing khối
  lượng lớn nên chia nhỏ. Hệ đã throttle (`send.delayMs`, mặc định 1,2s) + giới hạn
  `send.perRunLimit` mỗi lần chạy, và tôn trọng huỷ nhận/bounce/mail ảo.
- Để vào inbox tốt: bảo đảm tên miền `hoangminhhoa.net` đã cấu hình **SPF/DKIM/DMARC** đúng
  trong DNS (Lark Mail cung cấp bản ghi khi thêm tên miền).
- Muốn quy mô rất lớn về sau: có thể chuyển sang ESP (Brevo/SendGrid) — chỉ cần đổi `email.mjs`,
  phần còn lại giữ nguyên.
