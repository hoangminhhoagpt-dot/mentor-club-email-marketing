// verifier.port25.com nhận thư rồi trả lời kèm kết quả SPF / DKIM / DMARC.
// Thư trả lời về đúng hộp hoaguru@ nên đọc lại được bằng IMAP.
import { makeTransport } from "./scripts/email.mjs";
import { loadConfig } from "./scripts/lib.mjs";
const CFG = loadConfig();
const t = makeTransport(CFG);
const r = await t.sendMail({
  from: `"${CFG.smtp.fromName}" <${CFG.smtp.from || CFG.smtp.user}>`,
  to: "check-auth@verifier.port25.com",
  subject: "Kiem tra xac thuc",
  text: "Kiem tra SPF DKIM DMARC.",
});
console.log("✔ đã gửi tới bộ chấm điểm xác thực ·", r.messageId);
