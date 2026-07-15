# 04 — Deploy Cloudflare Worker (tracking mở/click/huỷ nhận)

Worker là 1 file (`worker/tracker.js`) đóng vai trò endpoint luôn-bật, ghi thẳng vào Lark:
- `/o` → 12.5 Báo cáo đọc Email (mở)
- `/c` → 12.9 Danh sách email click link (click) rồi redirect
- `/u` → 12.6 Huỷ nhận email

Cloudflare Workers có gói **miễn phí** (100.000 request/ngày) — quá đủ.

## Bước 1 — Cài công cụ + đăng nhập
```bash
npm install -g wrangler
wrangler login          # mở trình duyệt, đăng nhập Cloudflare (tạo tài khoản free nếu chưa có)
```

## Bước 2 — Điền biến không bí mật
Mở `worker/wrangler.toml`, kiểm tra `[vars]`:
- `LARK_APP_TOKEN` = app_token của Base (lấy từ `node scripts/check-setup.mjs`). **Bắt buộc điền.**
- `TABLE_OPEN / TABLE_CLICK / TABLE_UNSUB` — đã điền sẵn id đúng (12.5 / 12.9 / 12.6).
- `LARK_APP_ID`, `LARK_DOMAIN` — đã điền sẵn.

## Bước 3 — Đặt secret + deploy
```bash
cd worker
wrangler secret put LARK_APP_SECRET     # dán app secret của Lark (không viết vào file)
wrangler deploy
```
Kết quả in ra URL: `https://mentor-club-tracker.<subdomain>.workers.dev`

## Bước 4 — Khai báo URL cho hệ gửi
- Sửa `scripts/config.local.json → tracker.baseUrl` = URL vừa nhận.
- Đặt GitHub Variable `TRACKER_BASE_URL` = URL đó.

## Bước 5 — Kiểm tra
- Mở `https://.../ ` → thấy `mentor-club email tracker: OK`.
- Gửi thử 1 email (send-newsletter tới chính bạn), mở email → dòng mới xuất hiện ở **12.5**;
  bấm 1 link trong email → dòng mới ở **12.9**; bấm “Huỷ nhận” → dòng mới ở **12.6**.

## Nếu bạn đổi tên cột trên Lark
Sửa khối `FIELDS` ở đầu `worker/tracker.js` cho khớp tên cột thật, rồi `wrangler deploy` lại.

## Vì sao cần Worker?
SMTP thuần chỉ **gửi** được, không biết ai mở/click. Pixel ảnh và link redirect cần một URL
luôn-bật để ghi lại lượt truy cập — GitHub Actions (chạy rồi tắt) không làm được việc này, nên
tách ra Worker. Bounce (12.8) thì lấy được qua IMAP nên không cần Worker.
