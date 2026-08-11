# Thư yêu cầu Lark Support gỡ chặn 912

Gửi qua: Lark Admin Console → Help & Support → Submit a ticket (hoặc `support@larksuite.com`).
Đính kèm: một ảnh chụp thư dội có dòng `912 This mail is rejected by antispam system`.


> Bổ sung ngày 11/8: Google đã gửi báo cáo DMARC cho tên miền mentorcamp.io.vn (Report-ID
> 13703331663955382438, khoảng 9–10/8). Kết quả: **toàn bộ thư tới Google đều DKIM pass và
> SPF pass, disposition = none** — nghĩa là Google KHÔNG chặn, không cho vào spam, không có
> thư nào trượt xác thực. Selector DKIM của Lark là `lark2608050312`.
>
> Điểm đáng chú ý: cả ngày chỉ có **5 thư** tới được Google, trong khi bên mình gửi nhiều
> hơn thế. Số còn lại bị chặn ngay tại Lark, chưa từng rời khỏi hệ thống.
>
> ⇒ Bằng chứng từ phía người nhận khẳng định: cấu hình tên miền hoàn hảo, phía nhận không
> hề từ chối. Toàn bộ vấn đề nằm ở bộ lọc của Lark.

---

## Bản tiếng Anh (dự phòng, nếu ticket được chuyển cho đội quốc tế)

**Subject:** All outbound mail from our public mailbox rejected with 912 antispam — request review and remediation

---

Hello Lark Support,

Since the evening of 7 August 2026, **every outbound email** sent from our public mailbox
`hoaguru@mentorcamp.io.vn` is rejected and bounced back with:

```
912 This mail is rejected by antispam system
```

Internal delivery within our own domain still works. Only mail leaving the organisation is
blocked. The rejection is immediate and applies to every message, regardless of content.

**We have already ruled out content as the cause.** Controlled tests:

| Test | Result |
|---|---|
| Two identical emails, one with tracking pixel + wrapped links, one with neither | **Both rejected** |
| Plain transactional email (registration confirmation), no marketing content | **Rejected** |
| Batch of only 2–3 recipients | **Rejected** |
| 4-word plain-text message to `check-auth@verifier.port25.com` (a technical SPF/DKIM checker) | **Rejected** |
| Email to an internal address on the same domain | **Delivered normally** |

Our domain authentication is correctly configured:

- **SPF:** `v=spf1 include:spf.onlarksuite.com -all`
- **DKIM:** enabled in Lark Admin for `mentorcamp.io.vn`, verified passing by Gmail
- **DMARC:** `v=DMARC1; p=quarantine; sp=quarantine; adkim=r; aspf=r`
- **MX:** pointed to Lark (`mx1/mx2/mx3.larksuite.com`)

**Sample rejected messages** (all from `hoaguru@mentorcamp.io.vn`, times in UTC+7):

| Time | Recipient | Subject | Message-ID |
|---|---|---|---|
| 08 Aug 09:00 | nhoccuongbaby10@gmail.com | Lúc mình gần bỏ cuộc | `1c989eb8-1e96-8976-ca10-147cc3e286fc@mentorcamp.io.vn` |
| 08 Aug 10:54 | dienthoaihuutin@gmail.com | Xác nhận đăng ký: Doanh Nghiệp AI First | `5c43061a-8208-400c-aff5-39bf416a98cc_GEN_BY_LMS@mentorcamp.io.vn` |
| 08 Aug 11:32 | minhthu@gmail.com | Xác nhận đăng ký: Doanh Nghiệp AI First | `a4703e0e-8e20-45ed-a3aa-e7def33d62b3@mentorcamp.io.vn` |
| 08 Aug 13:47 | haquoccuong090102@gmail.com | (test message) | `8af1d065-69a4-6387-7bf2-d51a58471e5c@mentorcamp.io.vn` |
| 08 Aug 14:40 | check-auth@verifier.port25.com | Kiem tra xac thuc | `50de7103-5d07-80d3-a5b2-b9fd7912a6e3@mentorcamp.io.vn` |

**Business impact:** this mailbox also sends **registration confirmations** for a paid event
(20–22 August 2026). Customers who register are not receiving their confirmation emails. This
is causing direct commercial damage, not merely a marketing inconvenience.

**What we are asking:**

1. Why is this mailbox / domain being rejected by the antispam system? Please tell us the
   specific reason or policy that was triggered.
2. Please review and lift the restriction.
3. Please confirm the official sending limits that apply to a public mailbox on our plan
   (per second / per hour / per day), so we can stay within them.
4. If bulk sending is not permitted from a public mailbox, please state that explicitly so we
   can move that traffic to a dedicated provider and keep only transactional mail on Lark.

Organisation: **StudioSuccess** · Domain: **mentorcamp.io.vn** · Mailbox: **hoaguru@mentorcamp.io.vn**

Thank you,
Hoàng Minh Hoá

---

## Bản tiếng Việt — DÙNG BẢN NÀY

**Tiêu đề:** Toàn bộ thư gửi ra ngoài từ hộp thư công khai bị chặn mã 912 — đề nghị kiểm tra và gỡ

---

Chào đội hỗ trợ Lark,

Từ tối 07/08/2026, **mọi thư gửi ra ngoài** từ hộp thư công khai `hoaguru@mentorcamp.io.vn`
đều bị trả lại với thông báo:

```
912 This mail is rejected by antispam system
```

Thư gửi nội bộ trong tổ chức vẫn bình thường; chỉ thư đi ra ngoài bị chặn, và bị chặn với
mọi nội dung.

**Chúng tôi đã kiểm tra và loại trừ nguyên nhân do nội dung:**

| Phép thử | Kết quả |
|---|---|
| Hai thư giống hệt nhau, một có mã theo dõi một không | **Cả hai đều bị chặn** |
| Thư xác nhận đăng ký (thư giao dịch, không có nội dung quảng cáo) | **Bị chặn** |
| Đợt gửi chỉ 2–3 người nhận | **Bị chặn** |
| Thư 4 chữ không dấu gửi tới dịch vụ kiểm tra kỹ thuật | **Bị chặn** |
| Thư gửi tới địa chỉ nội bộ cùng tên miền | **Nhận bình thường** |

Cấu hình xác thực tên miền của chúng tôi đầy đủ và đúng chuẩn:

- **SPF:** `v=spf1 include:spf.onlarksuite.com -all`
- **DKIM:** đã bật trong Lark Admin cho `mentorcamp.io.vn`, Gmail xác nhận hợp lệ
- **DMARC:** `v=DMARC1; p=quarantine; sp=quarantine; adkim=r; aspf=r`
- **MX:** trỏ về Lark

**Một số thư bị chặn để tra cứu** (giờ Việt Nam):

| Thời điểm | Người nhận | Tiêu đề | Message-ID |
|---|---|---|---|
| 08/08 09:00 | nhoccuongbaby10@gmail.com | Lúc mình gần bỏ cuộc | `1c989eb8-1e96-8976-ca10-147cc3e286fc@mentorcamp.io.vn` |
| 08/08 10:54 | dienthoaihuutin@gmail.com | Xác nhận đăng ký: Doanh Nghiệp AI First | `5c43061a-8208-400c-aff5-39bf416a98cc_GEN_BY_LMS@mentorcamp.io.vn` |
| 08/08 11:32 | minhthu@gmail.com | Xác nhận đăng ký: Doanh Nghiệp AI First | `a4703e0e-8e20-45ed-a3aa-e7def33d62b3@mentorcamp.io.vn` |
| 08/08 14:40 | check-auth@verifier.port25.com | Kiem tra xac thuc | `50de7103-5d07-80d3-a5b2-b9fd7912a6e3@mentorcamp.io.vn` |

**Thiệt hại đang xảy ra:** hộp thư này còn dùng để gửi **thư xác nhận đăng ký** cho một sự
kiện có thu phí (20–22/08/2026). Khách đăng ký xong không nhận được thư xác nhận. Đây là
thiệt hại kinh doanh trực tiếp, không chỉ là bất tiện trong việc gửi tin.

**Chúng tôi đề nghị:**

1. Cho biết **lý do cụ thể** hộp thư/tên miền này bị hệ thống chống thư rác từ chối.
2. Kiểm tra và **gỡ hạn chế**.
3. Xác nhận **hạn mức gửi chính thức** áp dụng cho hộp thư công khai theo gói chúng tôi đang
   dùng (mỗi giây / mỗi giờ / mỗi ngày) để chúng tôi tuân thủ.
4. Nếu hộp thư công khai **không được phép gửi số lượng lớn**, xin nói rõ để chúng tôi chuyển
   phần đó sang dịch vụ chuyên dụng và chỉ giữ thư giao dịch trên Lark.

Tổ chức: **StudioSuccess** · Tên miền: **mentorcamp.io.vn** · Hộp thư: **hoaguru@mentorcamp.io.vn**

Trân trọng,
Hoàng Minh Hoá

---

## Bản nhắn tin (chat với hỗ trợ) — gần gũi, chia thành 3 tin

Nhắn từng tin một, chờ họ đọc rồi gửi tin tiếp. Đừng dán cả ba cùng lúc.

### Tin 1 — nói vấn đề

> Chào bạn, mình cần hỗ trợ gấp một việc về mail.
>
> Hộp thư công khai của bên mình là hoaguru@mentorcamp.io.vn. Từ tối 7/8 tới giờ, mọi thư
> gửi ra ngoài đều bị trả lại, báo lỗi: "912 This mail is rejected by antispam system".
>
> Thư gửi nội bộ trong công ty thì vẫn bình thường, chỉ thư ra ngoài là bị chặn hết.

### Tin 2 — đưa bằng chứng đã tự kiểm tra

> Bên mình đã tự kiểm tra để loại trừ nguyên nhân do nội dung thư, kết quả như sau:
>
> · Gửi 2 thư giống hệt nhau, một thư có gắn ảnh theo dõi và link, một thư không có gì
>   → cả hai đều bị chặn
> · Thư xác nhận đăng ký cho khách (thư giao dịch, không hề quảng cáo) → cũng bị chặn
> · Đợt chỉ gửi 2–3 người → vẫn bị chặn
> · Thử gửi một thư chỉ có 4 chữ không dấu tới một dịch vụ kiểm tra kỹ thuật → cũng bị chặn
>
> Cấu hình tên miền bên mình đầy đủ: SPF, DKIM đã bật trong Lark Admin, DMARC để mức
> quarantine, MX trỏ về Lark.
>
> Vài Message-ID để bạn tra giúp (đều gửi từ hoaguru@mentorcamp.io.vn):
> · 1c989eb8-1e96-8976-ca10-147cc3e286fc@mentorcamp.io.vn (8/8 lúc 09:00)
> · 5c43061a-8208-400c-aff5-39bf416a98cc_GEN_BY_LMS@mentorcamp.io.vn (8/8 lúc 10:54)
> · 50de7103-5d07-80d3-a5b2-b9fd7912a6e3@mentorcamp.io.vn (8/8 lúc 14:40)

### Tin 3 — nói thiệt hại và đề nghị

> Việc này đang ảnh hưởng thật tới công việc: hộp thư đó còn dùng để gửi thư xác nhận
> đăng ký cho một sự kiện có thu phí ngày 20–22/08. Khách đăng ký xong không nhận được
> thư xác nhận nào cả.
>
> Bạn hỗ trợ giúp mình mấy việc này nhé:
>
> 1. Cho mình biết lý do cụ thể hộp thư bị hệ thống chặn là gì
> 2. Kiểm tra và gỡ giúp bên mình
> 3. Cho mình biết hạn mức gửi chính thức của hộp thư công khai theo gói đang dùng
>    (mỗi giờ, mỗi ngày là bao nhiêu) để bên mình làm cho đúng
> 4. Nếu hộp thư công khai vốn không dùng để gửi số lượng lớn thì bạn nói thẳng giúp,
>    bên mình sẽ chuyển phần đó sang dịch vụ khác, chỉ giữ thư giao dịch trên Lark
>
> Cảm ơn bạn nhiều.
