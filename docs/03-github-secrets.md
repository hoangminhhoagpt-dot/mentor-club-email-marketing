# 03 — Đưa lên GitHub + đặt Secrets/Variables

## Bước 1 — Đẩy code lên repo
```bash
cd _deploy-mentor-club-email-marketing
git init -b main
git add scripts .github worker docs README.md package.json .gitignore
git commit -m "Hệ thống Email Marketing Lark Base (9 bảng) — SMTP + Worker tracking"
git remote add origin https://github.com/hoangminhhoagpt-dot/mentor-club-email-marketing.git
git push -u origin main
```
> `config.local.json` đã bị `.gitignore` — KHÔNG lên git. Đúng như vậy.

## Bước 2 — Secrets (bí mật) — Settings → Secrets and variables → Actions → **Secrets**
| Tên | Giá trị |
|---|---|
| `LARK_APP_SECRET` | App secret của app Lark |
| `SMTP_PASS` | IMAP/SMTP password của Lark Mail |
| `IMAP_PASS` | (tuỳ chọn) — bỏ trống thì dùng `SMTP_PASS` (cùng mật khẩu) |

## Bước 3 — Variables (không bí mật) — cùng trang → tab **Variables**
| Tên | Giá trị | Ghi chú |
|---|---|---|
| `SMTP_USER` | `hoaguru2@hoangminhhoa.net` | địa chỉ gửi (đã có default sẵn) |
| `SMTP_FROM_EMAIL` | `hoaguru2@hoangminhhoa.net` | trùng SMTP_USER (đã có default sẵn) |
| `SMTP_FROM_NAME` | `Mentor Club` | tên hiển thị |
| `TRACKER_BASE_URL` | `https://mentor-club-tracker.<sub>.workers.dev` | URL Worker (bước 04) |
| `LARK_APP_TOKEN` | app_token của Base | lấy từ `check-setup.mjs` |
| `SEND_PER_RUN_LIMIT` | `400` | tối đa email/lần chạy |
| `SEND_DELAY_MS` | `1200` | nghỉ giữa 2 email (ms) |

> `LARK_APP_ID`, `LARK_WIKI_TOKEN` và các `TABLE_*` đã có **default sẵn** trong workflow (giá trị
> đúng của bạn), chỉ cần đặt Variable nếu muốn ghi đè.

## Bước 4 — Lấy PAT để gọi HTTP
- GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)**.
- Scope: **`repo`**. (Fine-grained thì bật Contents: Read and write cho repo này.)
- Dùng token này trong header `Authorization: Bearer <PAT>` khi gọi `dispatches`.

## Bước 5 — Nghiệm thu
- Tab **Actions** → chọn workflow → **Run workflow** (thử `send-nurture` với `dry_run=true`).
- Hoặc gọi HTTP (xem README) → trả **204** → xem log ở Actions.
