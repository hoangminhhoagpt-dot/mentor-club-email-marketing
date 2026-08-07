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
  "user": "hoaguru@mentorcamp.io.vn",
  "pass": "<IMAP/SMTP password>",
  "fromName": "Hoàng Minh Hoá Và Cộng Sự",
  "fromEmail": "hoaguru@mentorcamp.io.vn"
},
"imap": { "host": "imap.larksuite.com", "port": 993, "user": "hoaguru@mentorcamp.io.vn", "pass": "<IMAP/SMTP password>" }
```
> `fromEmail` **phải** là chính địa chỉ hộp thư đã xác thực, nếu không Lark từ chối gửi.

## Kiểm tra
```bash
node scripts/check-setup.mjs
```
Dòng `✔ SMTP đăng nhập (...)` là đạt. (Đã test thực tế: login SMTP + IMAP tới Lark Mail thành công.)

## Hạn mức CHÍNH THỨC (Lark Pro — đọc trong Admin → Mail → hộp thư → IMAP/SMTP service)

| Loại | Con số |
|---|---|
| Tần suất gửi qua SMTP | **200 thư / 100 giây** |
| Tổng mỗi ngày, mỗi người gửi | **6.000 thư / ngày** |

Nhịp mặc định (`send.delayMs` 4.000ms + dao động 2.000ms ≈ 5 giây/thư) tương đương
**20 thư/100 giây = 10% hạn mức tần suất** — rất an toàn, nhưng cũng có nghĩa 6.000 thư mất
khoảng **8 giờ máy chạy**. Cần nhanh hơn thì hạ `delayMs` còn 1.500ms (≈ 33% hạn mức).

> ⚠️ **6.000/ngày là hạn mức của CẢ HỘP THƯ, không riêng phần marketing.** Nếu hộp thư này còn
> gửi thư giao dịch (xác nhận đăng ký, hoá đơn, trả lời khách) thì marketing **ăn tranh hạn mức
> của những thư quan trọng đó** — đụng trần là thư xác nhận của khách cũng không đi được.
> Gửi khối lượng lớn thì tách hộp thư riêng, hoặc chuyển sang ESP.

## Giới hạn & deliverability
- Hệ đã tự hãm: `send.delayMs` + dao động ngẫu nhiên, `send.perRunLimit` mỗi lượt chạy,
  phanh dừng khi bị từ chối liên tiếp, và luôn tôn trọng huỷ nhận/bounce/mail ảo.
- Để vào inbox tốt: tên miền gửi phải có **SPF/DKIM/DMARC** đúng trong DNS (Lark cấp bản ghi
  khi thêm tên miền). Lưu ý: **Lark dùng selector DKIM riêng theo tổ chức** — tra DNS bằng các
  tên selector phổ biến sẽ không thấy gì, đừng vội kết luận là chưa bật. Kiểm bằng cách gửi thử
  rồi xem thư vào Hộp chính hay Thư rác.
- **Hộp thư mới phải khởi động ấm.** Tên miền chưa có lịch sử gửi mà bắn vài nghìn thư ngày đầu
  là vào thư rác hàng loạt. Tăng dần khoảng 3 tuần: 200 → 500 → 1.000 → 2.000 → 5.000.
- Muốn quy mô rất lớn về sau: có thể chuyển sang ESP (Brevo/SendGrid) — chỉ cần đổi `email.mjs`,
  phần còn lại giữ nguyên.
