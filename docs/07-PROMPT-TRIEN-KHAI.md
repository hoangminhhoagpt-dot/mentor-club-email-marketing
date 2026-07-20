# 07 — PROMPT RA LỆNH CHO CLAUDE TỰ TRIỂN KHAI

Dán nguyên khối dưới đây vào Claude Code (đã mở ở thư mục làm việc trống hoặc thư mục repo).
Dùng khi: cài cho **khách/học viên mới**, hoặc dựng lại trên **máy mới**.

> Vì sao cần prompt riêng thay vì để Claude tự mò: bộ này có **4 cái bẫy** đã làm hỏng thật ít nhất
> một lần (ghi rõ trong prompt). Không cảnh báo trước thì máy mới sẽ đạp lại đúng vết đó.

---

## KHỐI DÁN

```
Triển khai hệ Email Marketing trên Lark Base cho một khách mới.

REPO: https://github.com/hoangminhhoagpt-dot/mentor-club-email-marketing
HỢP ĐỒNG: itto.yaml ở gốc repo — ĐỌC FILE NÀY TRƯỚC MỌI THỨ, nó là nguồn sự thật về
bảng, secret, biến, và 4 điểm bấm.

NGUYÊN TẮC BẮT BUỘC:
- KHÔNG in secret/token ra màn hình. Ghi thẳng vào file cấu hình hoặc GitHub Secrets.
- KHÔNG commit scripts/config.local.json (đã .gitignore — kiểm lại trước khi commit).
- Mỗi bước xong phải CHỨNG MINH bằng lệnh kiểm, không tự tuyên bố "đã xong".
- Thiếu thông tin thì DỪNG LẠI HỎI TÔI, đừng đoán.

LÀM THEO THỨ TỰ:

1. Clone repo, `npm install`, chạy `node check-itto.mjs`.
   Nó phải XANH. Đỏ ở đâu sửa đó rồi mới đi tiếp.

2. Hỏi tôi đủ 5 thứ (ô "I" của ITTO, xem docs/00-PHIEU-INPUT.md):
   a. Link Lark Base của khách — nhân bản từ Base Mẫu ở itto.yaml (mở link → "..." →
      Tạo bản sao). Lấy app_token là đoạn sau /base/ trong URL.
   b. Lark App ID + App Secret (app phải có scope bitable:app VÀ được thêm làm cộng
      tác viên CÓ QUYỀN SỬA của Base đó — chỉ quyền đọc sẽ lỗi 91403 khi ghi).
   c. Hộp thư gửi + IMAP/SMTP password của Lark Mail (KHÔNG phải mật khẩu đăng nhập).
   d. Repo GitHub đích của khách (fork hoặc repo mới).
   e. Tài khoản Cloudflare (nếu khách muốn đo mở/click; không có thì bỏ qua bước 5,
      hệ vẫn gửi được, chỉ mất số liệu).

3. Tạo scripts/config.local.json từ config.example.json, điền giá trị ở bước 2.
   Chạy `node scripts/setup-tables.mjs --base <app_token>`.
   ⚠️ BẮT BUỘC có cờ --base. Script tự TẠO bảng còn thiếu và BÙ cột cho bảng đã có;
   chạy lại nhiều lần vô hại. Cuối lệnh nó in sẵn khối JSON "tables" — dán vào config.
   Rồi chạy `npm run check`, phải xanh hết 9 bảng + SMTP.

4. Chạy thử KHÔNG gửi thật: đặt "send": {"dryRun": true} trong config, chạy
   `node scripts/send-nurture.mjs`. Xem log hợp lý rồi mới đổi false.

5. (Nếu có Cloudflare) Sửa worker/wrangler.toml: LARK_APP_TOKEN + TABLE_OPEN +
   TABLE_CLICK + TABLE_UNSUB thành id CỦA KHÁCH.
   ⚠️ BẪY 1: file này hard-code theo từng base. Quên sửa là tracking của khách ghi
   nhầm vào base người khác.
   ⚠️ BẪY 2: trên Windows, wrangler LỖI nếu chạy từ đường dẫn mạng UNC (\\...).
   Chép worker/ ra thư mục local ($env:TEMP) rồi deploy từ đó.
   Deploy: `npx wrangler login` rồi `npx wrangler deploy`, sau đó
   `npx wrangler secret put LARK_APP_SECRET`.
   ⚠️ BẪY 3: deploy KHÔNG có hiệu lực tức thì. Chờ 30–60 giây rồi mới kiểm, nếu không
   sẽ thấy bản cũ và tưởng hỏng.
   Điền URL Worker vào config (tracker.baseUrl) và GitHub Variable TRACKER_BASE_URL.

6. Đặt GitHub Secrets: LARK_APP_SECRET, SMTP_PASS.
   Đặt GitHub Variables — ⚠️ BẪY 4, QUAN TRỌNG NHẤT:
   các file .github/workflows/*.yml có GIÁ TRỊ MẶC ĐỊNH CỨNG trỏ về base gốc của
   Hoàng Minh Hoá. Không đặt biến đè lên thì Actions chạy vào base NGƯỜI KHÁC, báo
   success mà gửi 0 — không có lỗi nào hiện ra.
   Phải đặt đủ: LARK_APP_TOKEN (then chốt nhất — có nó là bỏ qua đường resolve qua
   wiki), TABLE_NURTURE, TABLE_CAMPAIGN, TABLE_NL_LIST, TABLE_NL_MAIL, TABLE_UNSUB,
   TABLE_ERROR, TABLE_FAKE.
   Nếu khách dùng hộp thư khác: đặt thêm SMTP_USER, SMTP_FROM_EMAIL, SMTP_FROM_NAME.

7. Nghiệm thu trên Actions: chạy workflow send-nurture với dry_run=true.
   Đọc log và kiểm con số "bỏ qua":
   - "bỏ qua 0"  = KHÔNG thấy dòng người nhận nào → sai base hoặc bảng rỗng. HỎNG.
   - "bỏ qua N>0" hoặc có dòng "(dry-run) Ngày X → email" = ĐÚNG.
   Đừng nghi SMTP trước khi xem con số này.

8. Hướng dẫn khách 3 việc cuối (chỉ khách làm được, trong giao diện):
   - Dựng 2 Lark Automation theo docs/05: nút "Gửi ngay" ở 12.4 truyền record_id,
     và lịch chạy send-nurture hằng ngày.
   - Đổ nội dung thật vào 12.1–12.4.
   - Bật SPF/DKIM/DMARC cho tên miền gửi. ⚠️ Bỏ qua bước này thì thư đi vào spam
     mà log vẫn báo gửi thành công — kiểu hỏng khó phát hiện nhất của cả bộ.

Xong hết thì tóm tắt cho tôi: base_token, URL Worker, danh sách Secrets/Variables đã
đặt, và những việc còn lại khách phải tự làm.
```

---

## Nếu chỉ là DỰNG LẠI TRÊN MÁY MỚI (cùng khách, cùng base)

Bỏ bước 2a, 3 (bảng đã có), 5 (Worker đã deploy), 6 (Secrets/Variables đã đặt).
Chỉ cần: clone → `npm install` → tạo lại `scripts/config.local.json` → `npm run check`.

## Bốn cái bẫy — bản rút gọn để nhớ

| # | Bẫy | Hậu quả nếu quên |
|---|---|---|
| 1 | `wrangler.toml` hard-code base | Tracking khách A ghi vào base khách B |
| 2 | wrangler lỗi trên đường dẫn UNC | Deploy fail khó hiểu trên Windows |
| 3 | Deploy Cloudflare không tức thì | Kiểm quá sớm → tưởng hỏng, sửa lung tung |
| 4 | Workflow có default cứng trỏ base gốc | **Actions báo success mà gửi 0 email** |

Bẫy 4 nguy hiểm nhất vì nó *im lặng*: không log lỗi, không cảnh báo, tab Actions xanh.
