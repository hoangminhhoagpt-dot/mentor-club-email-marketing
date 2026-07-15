# 01 — Cấu hình Gmail (SMTP gửi + IMAP đọc bounce)

Hệ thống gửi email bằng chính tài khoản Gmail của bạn. Gmail **không cho** dùng mật khẩu thường
cho SMTP — phải tạo **App Password** (mật khẩu ứng dụng 16 ký tự).

## Bước 1 — Bật xác minh 2 bước
1. Vào https://myaccount.google.com/security
2. Bật **2-Step Verification** (Xác minh 2 bước). Bắt buộc mới tạo được App Password.

## Bước 2 — Tạo App Password
1. Vào https://myaccount.google.com/apppasswords
2. Đặt tên bất kỳ (vd `mentor-club-email`) → **Create**.
3. Google hiện **16 ký tự** (dạng `abcd efgh ijkl mnop`). Copy lại (bỏ dấu cách cũng được).

> Dùng chung mật khẩu ứng dụng này cho cả **SMTP (gửi)** lẫn **IMAP (đọc bounce)**.

## Bước 3 — Điền vào config
Trong `scripts/config.local.json`:
```json
"smtp": {
  "host": "smtp.gmail.com", "port": 465, "secure": true,
  "user": "ban@gmail.com",
  "pass": "abcdefghijklmnop",
  "fromName": "Mentor Club",
  "fromEmail": "ban@gmail.com"
},
"imap": { "host": "imap.gmail.com", "port": 993, "user": "ban@gmail.com", "pass": "abcdefghijklmnop" }
```

## Bước 4 — Bật IMAP trong Gmail (để bắt bounce)
Gmail → **Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP → Save**.

## Kiểm tra
```bash
node scripts/check-setup.mjs
```
Dòng `✔ SMTP đăng nhập (...)` là đạt. Nếu lỗi `Invalid login` → App Password sai hoặc chưa bật 2FA.

## Giới hạn gửi (đọc kỹ)
| Loại tài khoản | Giới hạn/ngày (tham khảo) |
|---|---|
| Gmail cá nhân | ~500 người nhận |
| Google Workspace | ~2.000 người nhận |

- Script tự chia nhỏ + nghỉ giữa các email (`send.delayMs`, mặc định 1,2s) và giới hạn
  `send.perRunLimit` mỗi lần chạy để tránh bị Google khoá tạm.
- Gửi marketing khối lượng lớn từ Gmail dễ vào **spam**. Muốn quy mô lớn: dùng tên miền riêng
  có SPF/DKIM, hoặc chuyển sang dịch vụ gửi chuyên dụng (Brevo/SendGrid) — kiến trúc giữ nguyên,
  chỉ đổi `email.mjs`.
