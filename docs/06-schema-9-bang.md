# 06 — Schema 9 bảng (12.1 → 12.9)

Đây là bộ cột **mặc định** mà `setup-tables.mjs` sẽ tạo (nếu còn thiếu) và code đọc/ghi.
Nếu bảng thật của bạn dùng tên cột khác, có 2 cách:
- **Cách 1 (khuyên dùng):** để `setup-tables.mjs` tạo đúng các cột này.
- **Cách 2:** giữ tên cột hiện có, rồi khai báo ánh xạ trong `config.local.json → fields`, ví dụ:
  ```json
  "fields": { "nurtureList": { "email": "Địa chỉ mail", "startDate": "Ngày vào phễu" } }
  ```

> Cột chính (primary) sẵn có của mỗi bảng KHÔNG bị đụng. Nếu muốn cột chính là `Email`, đổi tên thủ công.

Kiểu cột Lark: `Text(1) Number(2) SingleSelect(3) DateTime(5) Checkbox(7) Url(15)`.
Mọi cột DateTime ghi bằng **epoch milliseconds**.

---

## Ý nghĩa & vai trò từng bảng (đọc trước)

9 bảng chia làm **3 nhóm** theo vai trò trong luồng gửi email.

### 🟢 Nhóm GỬI — 2 cặp "người nhận + nội dung"
Mỗi chiến dịch = 1 bảng người nhận + 1 bảng nội dung.

| Bảng | Vai trò | Bạn hay hệ ghi? |
|---|---|---|
| **12.1 Danh sách Email Nuôi Dưỡng** | Người nhận của phễu 365 ngày. Mỗi dòng 1 người, có "Ngày bắt đầu" (mốc tính họ đang ở ngày thứ mấy) và "Bước gần nhất" (email cuối đã gửi tới họ). | Bạn thêm người; hệ tự cập nhật bước. |
| **12.2 Chiến dịch Email 365 ngày** | "Kịch bản" nội dung: mỗi dòng = 1 Ngày (1,2,3…) có Tiêu đề + Nội dung. Ghép với 12.1 → mỗi người nhận đúng email theo ngày họ đang ở, **tuần tự**, 1 email/ngày. | Bạn soạn nội dung. |
| **12.3 Danh sách Email bảng tin** | Người đăng ký nhận **bản tin** (gửi hàng loạt cùng lúc, khác nuôi dưỡng gửi theo tiến độ từng người). | Bạn/subscriber thêm. |
| **12.4 Email bảng tin** | Mỗi dòng = 1 **số bản tin**. Bấm gửi 1 số → hệ gửi tới toàn bộ 12.3, rồi tự ghi "Đã gửi" + số người. | Bạn soạn; hệ ghi kết quả. |

### 🔵 Nhóm ĐO LƯỜNG — hệ tự điền, bạn chỉ đọc
Cloudflare Worker ghi mỗi khi người nhận tương tác.

| Bảng | Vai trò |
|---|---|
| **12.5 Báo cáo đọc Email** | Ai **mở** email (pixel), chiến dịch/bước nào, mở mấy lần → đo tỷ lệ mở. |
| **12.9 Danh sách email click link** | Ai **bấm link** trong email, link đích nào, mấy lần → đo tỷ lệ click (tín hiệu quan tâm mạnh nhất). |

### 🔴 Nhóm BẢO VỆ — chặn gửi sai, giữ uy tín hộp thư
Hệ **đọc cả 3 bảng trước mỗi lần gửi** để loại người khỏi danh sách (suppression).

| Bảng | Vai trò |
|---|---|
| **12.6 Huỷ nhận email** | Ai bấm "Huỷ nhận" → ghi vào đây → **không bao giờ gửi lại** (luật bắt buộc). |
| **12.7 Lọc mail ảo** | Kiểm cú pháp + tên miền có nhận mail (MX) + mail dùng 1 lần → email "Không hợp lệ" bị chặn gửi. |
| **12.8 Danh sách mail lỗi** | Email bị **dội (bounce)** — bắt qua IMAP. Hard bounce bị chặn vĩnh viễn để hộp thư không bị đánh dấu spam. |

### Dòng chảy tóm tắt
```
Gửi:   12.1+12.2 (nuôi dưỡng)      12.3+12.4 (bản tin)
          │                           │
          └────── loại trừ ───────────┘   ← 12.6 (huỷ) + 12.7 (mail ảo) + 12.8 (bounce)
          │
          ▼ gửi qua Lark Mail
     mở/bấm  → 12.5 (mở) · 12.9 (click)
     dội lỗi → 12.8 (bounce)
```

---

## 12.1 Danh sách Email Nuôi Dưỡng — `tbltZ1K0MEVMA0hD`
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| Email | Text | địa chỉ người nhận |
| Tên | Text | dùng cho `{{name}}` trong nội dung |
| Ngày bắt đầu | DateTime | mốc tính “ngày thứ N” của phễu |
| Trạng thái | Select: Đang nuôi / Tạm dừng / Hoàn thành / Đã huỷ | chỉ gửi khi **Đang nuôi** |
| Bước gần nhất | Number | ngày drip đã gửi gần nhất (hệ thống tự ghi) |
| Lần gửi gần nhất | DateTime | hệ thống tự ghi |
| Ghi chú | Text | tuỳ ý |

## 12.2 Chiến dịch Email 365 ngày — `tblSpd0cH3yVczMl`
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| Ngày | Number | 1..365 — ngày thứ mấy của phễu |
| Tiêu đề | Text | subject email |
| Nội dung | Text | thân email (HTML hoặc text; hỗ trợ `{{name}}`, `{{email}}`) |
| Kích hoạt | Select: Bật / Tắt | **Tắt** = bỏ qua ngày đó |

> Logic gửi: mỗi người nhận nhận **tuần tự** ngày 1, 2, 3… mỗi ngày 1 email (cron chạy 1 lần/ngày),
> không nhảy cóc kể cả khi cron lỡ ngày.

## 12.3 Danh sách Email bảng tin — `tbls6oZoxfUxZvkO`
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| Email | Text | người nhận bản tin |
| Tên | Text | `{{name}}` |
| Ngày đăng ký | DateTime | thời điểm vào danh sách |
| Trạng thái | Select: Đang nhận / Đã huỷ | chỉ gửi **Đang nhận** |
| Nguồn | Text | form/landing/nhập tay… |
| Ghi chú | Text | tuỳ ý |

## 12.4 Email bảng tin — `tblykPorYc7WR7Ss`
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| Tiêu đề | Text | subject |
| Nội dung | Text | thân email |
| Trạng thái | Select: Nháp / Chờ gửi / Đang gửi / Đã gửi | gửi khi **Chờ gửi** (hoặc bấm nút) |
| Lịch gửi | DateTime | nếu đặt, chỉ gửi khi tới giờ |
| Đã gửi | Number | hệ thống ghi số người đã gửi |
| Ngày gửi thực | DateTime | hệ thống ghi |

## 12.5 Báo cáo đọc Email — `tblvxxe82dGYQXQv`  *(Worker /o ghi)*
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| Email | Text | ai mở |
| Chiến dịch | Text | vd `Nuôi dưỡng 365` / `Bảng tin: <tiêu đề>` |
| Bước | Text | vd `Ngày 12` (drip) hoặc rỗng (bản tin) |
| Mở lần đầu | DateTime | |
| Mở gần nhất | DateTime | |
| Số lần mở | Number | tăng dần mỗi lần mở |
| Thiết bị | Text | user-agent |

## 12.6 Huỷ nhận email — `tbldkFroNQJXjZRV`  *(Worker /u ghi + suppression đọc)*
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| Email | Text | người huỷ |
| Thời gian huỷ | DateTime | |
| Nguồn | Select: Link / One-click / Trả lời / Thủ công | |
| Chiến dịch | Text | huỷ từ chiến dịch nào |

> Mọi email trong bảng này bị **chặn gửi** ở mọi chiến dịch.

## 12.7 Lọc mail ảo — `tblZHQX8FrGp1kPf`  *(filter-fake.mjs ghi)*
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| Email | Text | email cần kiểm |
| Kết quả | Select: Hợp lệ / Không hợp lệ / Nghi ngờ | |
| Lý do | Text | vd “Domain không có MX” |
| Có MX | Checkbox | domain có nhận mail không |
| Dùng 1 lần | Checkbox | domain mail ảo (disposable) |
| Thời gian kiểm tra | DateTime | |

> Email **Không hợp lệ** bị chặn gửi.

## 12.8 Danh sách mail lỗi — `tblNgcFWWyWI7erZ`  *(sync-bounces.mjs ghi)*
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| Email | Text | địa chỉ bị lỗi |
| Loại lỗi | Select: Hard bounce / Soft bounce / Từ chối / Khác | |
| Chi tiết | Text | mã trạng thái + diagnostic |
| Chiến dịch | Text | (nếu suy ra được) |
| Thời gian | DateTime | |

> **Hard bounce** bị chặn gửi vĩnh viễn.

## 12.9 Danh sách email click link — `tblw20eIsnURSIxC`  *(Worker /c ghi)*
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| Email | Text | ai click |
| Chiến dịch | Text | |
| Bước | Text | |
| Link đích | Url | link gốc được click |
| Nhấp lần đầu | DateTime | |
| Nhấp gần nhất | DateTime | |
| Số lần nhấp | Number | tăng dần |
