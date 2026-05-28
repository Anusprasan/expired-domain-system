import "../config/env.js";
import nodemailer from "nodemailer";

function createTransporter({ host, port, user, pass } = {}) {
  return nodemailer.createTransport({
    host: host || process.env.MAIL_HOST,
    port: Number(port || process.env.MAIL_PORT || 587),
    secure: false,
    auth: {
      user: user || process.env.MAIL_USER,
      pass: pass || process.env.MAIL_PASS,
    },
  });
}

const transporter = createTransporter();

export const sendMail = async ({
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  host,
  port,
  user,
  pass,
  from,
  attachments,
}) => {
  const activeTransporter =
    host || port || user || pass
      ? createTransporter({ host, port, user, pass })
      : transporter;

  return activeTransporter.sendMail({
    from: from || process.env.MAIL_FROM,
    to,
    cc,
    bcc,
    subject,
    text,
    html,
    attachments,
  });
};
