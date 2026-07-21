# 07 — PROMPT RA LỆNH CHO CLAUDE TỰ TRIỂN KHAI

Dán một trong hai khối dưới đây vào Claude Code (đã mở ở thư mục làm việc trống hoặc thư mục repo).
Dùng khi: cài cho **khách/học viên mới**, hoặc dựng lại trên **máy mới**.

> Vì sao cần prompt riêng thay vì để Claude tự mò: bộ này có **4 cái bẫy** đã làm hỏng thật ít nhất
> một lần (ghi rõ trong prompt). Không cảnh báo trước thì máy mới sẽ đạp lại đúng vết đó.

---

Có **2 khối dán**: **A** — điền sẵn giá trị, gửi một phát Claude chạy thẳng (dùng cho chính bộ
của Hoàng Minh Hoá); **B** — Claude hỏi từng bước (khi chưa có sẵn input).

## KHỐI DÁN A — BẢN ĐIỀN SẴN (gửi một phát, không hỏi lại)

Chỉ cần điền 3 chỗ `xxxx` (2 secret + PAT) rồi gửi. Muốn deploy vào base đang chạy thật `ZM8q…`
thì đổi 1 dòng `LARK_BASE_ID` sang `https://studiosuccess.sg.larksuite.com/base/ZM8qbz78JaR16Es560sly6Bkgvg`
(bước 4 tự đọc lại 9 table id mới).

```
Triển khai giúp tôi hệ Email Marketing trên Lark Base (9 bảng 12.1→12.9) từ repo:
https://github.com/hoangminhhoagpt-dot/mentor-club-email-marketing

INPUT CỦA TÔI (đã chuẩn bị sẵn):
- LARK_APP_ID      = cli_aa8cccd0b262deed
- LARK_APP_SECRET  = xxxxxxxxxxxxxxxx
- LARK_BASE_ID     = https://studiosuccess.sg.larksuite.com/wiki/Sm0TwzxpUia6pWkRGCClLfnwgrf   (dán cả link cũng được)
- SMTP_USER        = hoaguru2@hoangminhhoa.net        (hộp thư Lark Mail — dùng để gửi + quét bounce qua IMAP)
- SMTP_PASS        = xxxxxxxxxxxxxxxx                 (IMAP/SMTP password của Lark Mail, KHÔNG phải mật khẩu đăng nhập)
- SMTP_HOST        = smtp.larksuite.com:465   |   IMAP_HOST = imap.larksuite.com:993
- SMTP_FROM        = Mentor Club <hoaguru2@hoangminhhoa.net>
- TRACKER_BASE_URL = https://mentor-club-tracker.hoangminhhoa.workers.dev   (Worker đo mở/click — bỏ trống nếu chưa cần đo)
- GITHUB_PAT       = ghp_xxxxxxxx                     (scope repo)

YÊU CẦU:
1. Nhân bản repo về GitHub của tôi (đặt private nếu được) và ĐẢM BẢO Actions đã được BẬT trên bản
   nhân bản (nếu fork mà chưa bật, lệnh HTTP repository_dispatch trả 204 trông như thành công nhưng
   KHÔNG chạy gì).
2. Nếu Base của tôi nằm trong Lark Wiki (URL /wiki/...), tự resolve ra app_token THẬT trước khi cấu
   hình (không thì ghi record trả 91403, hoặc chạy vào sai chỗ mà không báo lỗi rõ). App Lark phải có
   scope bitable:app VÀ được thêm làm cộng tác viên CÓ QUYỀN SỬA của Base.
3. Đặt GitHub Secrets: LARK_APP_SECRET, SMTP_PASS (ghi thẳng, đừng in token ra màn hình).
4. Chạy setup-tables tạo/kiểm đủ 9 bảng 12.1→12.9 trong Base; đọc 9 table id in ra rồi đặt GitHub
   Variables: LARK_APP_ID, LARK_APP_TOKEN (then chốt nhất — có nó là bỏ qua đường resolve qua wiki),
   TABLE_NURTURE(12.1), TABLE_CAMPAIGN(12.2), TABLE_NL_LIST(12.3), TABLE_NL_MAIL(12.4),
   TABLE_UNSUB(12.6), TABLE_FAKE(12.7), TABLE_ERROR(12.8), và TRACKER_BASE_URL.
   ⚠️ Các workflow có GIÁ TRỊ MẶC ĐỊNH CỨNG trỏ base gốc — KHÔNG đặt đủ các Variable này thì Actions
   chạy vào base khác, báo success mà gửi 0 email, không lỗi nào hiện ra.
5. (Nếu có Cloudflare — để đo mở/click) deploy worker/tracker.js: sửa worker/wrangler.toml trỏ đúng
   LARK_APP_TOKEN + TABLE_OPEN(12.5)/TABLE_CLICK(12.9)/TABLE_UNSUB(12.6) của tôi, rồi `wrangler deploy`
   + `wrangler secret put LARK_APP_SECRET`, chờ 30–60s cho bản mới ăn. Không có Cloudflare thì bỏ qua,
   hệ vẫn gửi được, chỉ mất số liệu mở/click.
6. Chạy thử KHÔNG gửi thật: workflow send-nurture với dry_run=true. Đọc log con số "bỏ qua":
   "bỏ qua 0" = KHÔNG thấy người nhận nào (sai base / bảng rỗng) — HỎNG; "bỏ qua N>0" hoặc có dòng
   "(dry-run) Ngày X → email" = ĐÚNG. Đừng nghi SMTP trước khi xem con số này.
7. Tạo 2 automation trong Lark Base: (a) nút "Gửi ngay" trên 1 dòng bảng 12.4 → gọi HTTP
   repository_dispatch event_type=send-newsletter kèm record_id để gửi đúng bản tin đó; (b) lịch chạy
   hằng ngày → event_type=send-nurture (drip 365 ngày).
8. Xong thì báo lại cho tôi: 4 điểm bấm HTTP (event_type: send-nurture · send-newsletter · filter-fake
   · sync-bounces, cùng URL .../dispatches), xác nhận đã đọc đúng Base (con số "bỏ qua" lúc dry-run),
   URL Worker, danh sách Secrets/Variables đã đặt, và chỉ tôi cách bấm nút gửi thử 1 bản tin.

LƯU Ý (tôi tự làm sau khi deploy xong): đổ nội dung thật vào 12.1–12.4; bật SPF/DKIM/DMARC cho tên miền
gửi — bỏ qua thì thư vào spam mà log vẫn báo gửi thành công (kiểu hỏng khó phát hiện nhất của cả bộ).
```

---

## KHỐI DÁN B — HỎI TỪNG BƯỚC (khi chưa có INPUT sẵn)

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
