# Thư bị chặn đầu gửi — mã 912

> `912 This mail is rejected by antispam system`

Thư gửi đi, Lark nhận và báo thành công, rồi vài phút sau dội ngược về hộp của mình.
Người nhận không bao giờ thấy thư. Trong Lark Mail hiện dòng đỏ **"Gửi không thành công.
Email bị trả lại"**.

---

## Điều quan trọng nhất: đây KHÔNG phải lỗi địa chỉ khách

Mã 912 là **bộ lọc rác của chính Lark chặn ở đầu gửi**. Người nhận hoàn toàn bình thường.
Nếu đem những địa chỉ này bỏ vào danh sách chặn thì mình tự tay loại khách thật ra khỏi
danh sách — vĩnh viễn.

Hệ đã phân loại riêng nhóm này thành **"Bị chặn đầu gửi"** trong bảng 12.8 và **không**
đưa vào danh sách chặn gửi. Đừng sửa lại chỗ đó.

---

## Đã loại trừ được những gì (đo bằng thí nghiệm, không phải phỏng đoán)

| Nghi ngờ | Cách kiểm | Kết quả |
|---|---|---|
| Do pixel + link theo dõi | Gửi 2 thư giống hệt nhau, một có một không | **Cả hai đều bị chặn** |
| Do nội dung marketing | Thư "Xác nhận đăng ký" (thư giao dịch, hệ khác) | **Cũng bị chặn 3 lần** |
| Do gửi quá nhiều | Đợt chỉ có 2–3 thư | **Vẫn bị chặn** |
| Do tiêu đề có `[THỬ]` | Thư tiêu đề bình thường | **Vẫn bị chặn** |
| Do người nhận | Hộp nội bộ cùng tên miền | **Nhận được bình thường** |

➜ Kết luận: vấn đề nằm ở **uy tín hộp gửi / tên miền phía Lark**, không nằm trong hệ này.
Sửa code không giải quyết được.

---

## Xử lý gốc — việc phải làm trong Lark

1. **Mở phiếu hỗ trợ với Lark.** Đưa kèm: mã `912`, thời điểm cụ thể, và `Message-ID` của
   vài thư bị dội (cột **Message ID** trong bảng 12.8 có sẵn). Hỏi thẳng: tài khoản hoặc
   tên miền đang bị hạn chế gì, cần làm gì để gỡ.
2. **Kiểm trong Lark Admin** → Mail → Security and Anti-spam: xem có cảnh báo hoặc hạn chế
   nào đang bật cho hộp thư công khai không.
3. **Nâng DMARC lên `p=quarantine`.** Tên miền đang để `p=none` — mức thấp nhất, ai cũng
   giả mạo được, nên bị chấm điểm uy tín thấp. Đây cũng là điều kiện bắt buộc nếu sau này
   muốn hiện logo thương hiệu trong Gmail (BIMI).
4. **Tách hộp thư giao dịch khỏi hộp marketing.** Hiện thư "Xác nhận đăng ký" của khách
   và thư marketing đi chung một hộp. Marketing kéo uy tín xuống là **thư xác nhận của
   khách cũng không tới nơi** — mất tiền thật, không chỉ mất một lượt gửi.

---

## Đổi sang dịch vụ gửi chuyên dụng — không cần sửa code

Lark Mail là hộp thư làm việc, không phải công cụ gửi thư hàng loạt. Khi số lượng lớn dần
thì chuyện bị chặn sẽ lặp lại, dù có gỡ được lần này.

Hệ gửi qua SMTP tiêu chuẩn nên **đổi nhà cung cấp chỉ là đổi 4 dòng cấu hình**, không đụng
một dòng code nào:

```jsonc
"smtp": {
  "host": "email-smtp.ap-southeast-1.amazonaws.com",   // hoặc smtp.resend.com …
  "port": 465,
  "user": "<khoá truy cập>",
  "pass": "<khoá bí mật>",
  "from": "hoaguru@mentorcamp.io.vn",                  // giữ nguyên địa chỉ hiện ra cho khách
  "fromName": "Hoàng Minh Hoá Và Cộng Sự"
}
```

Trên GitHub thì đổi tương ứng `SMTP_HOST`, `SMTP_PORT` (Variables) và `SMTP_PASS` (Secret).

Ba lựa chọn thường dùng:

| Dịch vụ | Giá tham khảo | Ghi chú |
|---|---|---|
| Amazon SES | ~0,1 USD / 1.000 thư | Rẻ nhất; phải xin thoát chế độ thử nghiệm |
| Resend | miễn phí 3.000 thư/tháng | Dựng nhanh nhất |
| Brevo | miễn phí 300 thư/ngày | Có sẵn giao diện quản lý |

Dù chọn cái nào cũng phải thêm bản ghi SPF/DKIM của họ vào DNS tên miền — làm một lần.

---

## Trong lúc chờ xử lý: phanh tự động

Hệ tự ngó bảng 12.8 **trước mỗi đợt gửi**. Nếu trong 24 giờ qua có từ 5 thư bị chặn đầu
gửi trở lên thì **dừng, không bắn tiếp**.

Vì sao cần: mã 912 không lộ ra lúc gửi — Lark trả "thành công" rồi mới dội thư về sau.
Nên phanh cũ (đếm lần từ chối liên tiếp trong lúc gửi) không bao giờ nổ; nhật ký vẫn in
`gửi 2 · lỗi 0` trong khi cả hai thư đã bị chặn. Đang bị chặn mà cứ gửi thêm thì chỉ làm
uy tín hộp thư tệ đi.

Chỉnh trong `config.local.json`:

```jsonc
"send": {
  "chanDauGui": { "soGio": 24, "nguong": 5, "tat": false }
}
```

Muốn gửi bất chấp một lần: thêm cờ `--bo-qua-phanh`.

---

## Cách đọc bảng 12.8

| Loại lỗi | Nghĩa là gì | Có chặn gửi lần sau không |
|---|---|---|
| **Bị chặn đầu gửi** | Lark chặn, khách vô can | **Không** — vẫn gửi lại |
| Hard bounce | Địa chỉ không tồn tại | Có |
| Soft bounce | Hộp đầy, tạm thời | Có |

Cột **Dịch** đã chuyển lý do sang tiếng Việt để đọc là hiểu ngay.
