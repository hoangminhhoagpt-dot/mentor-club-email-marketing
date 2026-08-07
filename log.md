
## [2026-07-29] query | Viết send-bulk.mjs — script gửi hàng loạt đúng chuẩn thay cho gửi ad-hoc
- BỐI CẢNH: anh Cương cho biết đang gửi hàng loạt ad-hoc, KHÔNG qua send-nurture/send-newsletter → giải thích vì sao thư thật có chân thư viết tay và không có dấu vết injectTracking. Mọi phân tích trước đó bám vào 2 script kia là nhầm đường.
- ĐÃ TẠO: scripts/send-bulk.mjs. Bốn thứ nó làm mà gửi tay không có:
  (1) THƯ ĐÚNG CHUẨN — nodemailer tự set Message-ID/Date/MIME-Version; gửi CẢ text lẫn html (multipart); thêm header List-Unsubscribe dạng mailto khớp cách huỷ nhận bằng trả lời thư.
  (2) TỰ GẮN LINK CHO URL TRẦN — vá đúng lỗi đã phát hiện ở email.mjs:66 (URL trần ra thư thành chữ chết, không đo được click).
  (3) SỔ ĐÃ GỬI — ghi từng người ngay sau khi gửi, chạy lại là gửi tiếp người còn thiếu, không trùng.
  (4) PHANH — bị từ chối 5 lần LIÊN TIẾP thì DỪNG, tránh lãnh bức tường thư dội như 28/07.
- Nhịp mặc định 4000ms ± 2000ms = ~25 thư/100 giây = 12% hạn mức Lark (200/100s).
- AN TOÀN: mặc định CHẠY THỬ, phải thêm --send mới gửi thật. Thư bị mã 912 được ghi riêng là "bị bộ lọc từ chối", KHÔNG coi là địa chỉ hỏng, chạy lại sẽ gửi tiếp cho họ.
- ĐÃ TEST THẬT (dry-run): lọc trùng, bỏ dòng rác, thay {{name}} ở cả tiêu đề lẫn thân, và xác minh URL trần -> <a href>, markdown link không bị gắn 2 lần, HTML được escape.

## [2026-07-29] query | CẢI THIỆN HỆ THỐNG GỬI TỰ ĐỘNG — đã sửa 6 file, test xong
- Bối cảnh: anh Cương xác nhận đang gửi TỰ ĐỘNG BẰNG HỆ THỐNG (send-nurture/send-newsletter), nên sửa thẳng vào pipeline.
- email.mjs: (a) thêm toPlainText() + gửi kèm bản chữ thuần => thư thành multipart/alternative thay vì chỉ-HTML; (b) List-Unsubscribe LUÔN gắn (dạng mailto ?subject=ngung-nhan) kể cả khi tắt tracking — trước đây chỉ gắn khi có unsubUrl nên bản chạy thật KHÔNG có header nào; (c) inlineMd tự gắn link cho URL DÁN TRẦN (vá lỗi link chữ chết + bảng 12.9 luôn trống); (d) thêm isAntispamReject().
- lib.mjs: delayMs mặc định 1500->4000, thêm delayJitterMs (2000) + stopAfterFails (5), thêm nextDelay() trả khoảng nghỉ NGẪU NHIÊN.
- send-nurture.mjs + send-newsletter.mjs: dùng nextDelay(); thêm PHANH dừng sau 5 lần từ chối LIÊN TIẾP; đếm riêng số thư bị lọc 912 và báo rõ "không phải địa chỉ hỏng".
- send-newsletter.mjs — VÁ LỖI CŨ NGHIÊM TRỌNG lộ ra khi thêm phanh: trước đây dừng giữa chừng (do perRunLimit hoặc phanh) VẪN đánh dấu "Đã gửi" => người ở nửa sau KHÔNG BAO GIỜ nhận, người đầu bị gửi trùng khi chạy lại. Nay dùng "Số đã gửi" làm CON TRỎ: slice(doneBefore), chưa hết danh sách thì trả trạng thái về "Chờ gửi" để lần sau đi tiếp.
- sync-bounces.mjs: mã 912/antispam nay phân loại "Bị chặn đầu gửi", xét SAU cùng để đè lên nhánh Hard/Soft.
- suppression.mjs: loại trừ "Bị chặn đầu gửi" TRƯỚC nhánh /hard|từ chối|reject/ (nếu không chuỗi "từ chối" sẽ bắt nhầm).
- config.local.json: delayMs 1200->4000, thêm delayJitterMs 2000 + stopAfterFails 5. Nay ~20 thư/100 giây = 10% hạn mức Lark (200/100s).
- ĐÃ TEST: node --check cả 7 file; chạy thật toPlainText + ensureHtmlDoc (URL trần -> <a href>, markdown link không gắn 2 lần, HTML escape đúng); injectTracking vẫn bọc đúng link vừa autolink (click nay ĐO ĐƯỢC cho URL trần); isAntispamReject phân biệt đúng 912 vs 550 user unknown.
- CHƯA LÀM: chạy thử gửi thật (cần anh Cương quyết); DMARC; kiểm bảng 12.8 dọn các dòng bị đánh Hard bounce oan hôm 28/07.
