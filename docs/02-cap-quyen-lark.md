# 02 — Cấp quyền app Lark trên Base Email Marketing

Base nằm trong **Wiki** của tenant StudioSuccess:
`https://studiosuccess.sg.larksuite.com/wiki/Sm0TwzxpUia6pWkRGCClLfnwgrf`

App hiện dùng: **`cli_aa8cccd0b262deed`** (đang dùng cho các bộ TikTok/YouTube). Cần cấp cho nó
2 thứ: **quyền (scope)** ở Developer Console và **quyền cộng tác trên Base**.

> Nếu app này KHÔNG cùng tenant StudioSuccess (không thêm được vào Base), hãy tạo 1 **app nội bộ
> mới** trong tenant StudioSuccess và dùng app_id/app_secret của app mới ở mọi nơi.

## Bước 1 — Thêm scope trong Developer Console
1. Vào https://open.larksuite.com/app → mở app `cli_aa8cccd0b262deed`.
2. **Permissions & Scopes** → thêm:
   - `wiki:node:read` — để resolve wiki node → app_token của Base.
   - `bitable:app` (hoặc `bitable:app:readonly` + quyền ghi) — đọc/ghi record & tạo field.
   - `drive:drive` (khuyến nghị) — thao tác tài nguyên trong Base.
3. **Create version & Publish** (tạo phiên bản mới rồi phát hành) để scope có hiệu lực.

## Bước 2 — Thêm app làm cộng tác viên của Base
1. Mở Base Email Marketing trên Lark.
2. Góc phải trên **... (More)** → **Add-ons / Base extensions** hoặc nút **Share/Cộng tác**.
3. Thêm **bot của app** (`cli_aa8cccd0b262deed`) với quyền **Có thể chỉnh sửa (Editable)**.

   > Trên Lark, app đọc/ghi Bitable qua bot của app. Nếu chỉ thấy mục thêm người, tìm mục
   > “Add document application/Thêm ứng dụng” và chọn app của bạn.

## Bước 3 — Kiểm tra
```bash
node scripts/check-setup.mjs
```
- `✔ Resolve Base app_token: xxxx` → scope + cộng tác OK.
- Nếu `✘ ... scope wiki:node:read required` → chưa publish version có scope.
- Nếu resolve OK nhưng đọc bảng lỗi `permission denied` → chưa thêm app làm cộng tác viên Base.

## Ghi chú
- `app_token` in ra ở bước kiểm tra chính là giá trị điền vào **`LARK_APP_TOKEN`** cho Cloudflare
  Worker (`worker/wrangler.toml`) và GitHub Variable — Worker không có scope wiki nên cần app_token
  sẵn.
- Domain API là `https://open.larksuite.com` (phần `.sg` trong URL chỉ là vùng dữ liệu, không đổi domain API).
