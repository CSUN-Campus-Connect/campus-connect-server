import nodemailer from "nodemailer";
import logger from "@/utils/logger";
import { Announcement } from "@prisma/client";

// SMTP config pulled from env (Brevo via nodemailer)
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_KEY = process.env.SMTP_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL;
const FROM_NAME = process.env.EMAIL_FROM_NAME || "CampusConnect Alerts";

// Lazy transporter — built on first use, cached after
let transporter: nodemailer.Transporter | null = null;

const getTransporter = (): nodemailer.Transporter => {
  if (transporter) return transporter;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_KEY) {
    throw new Error("SMTP env vars missing (SMTP_HOST, SMTP_USER, SMTP_KEY)");
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for 587
    auth: {
      user: SMTP_USER,
      pass: SMTP_KEY,
    },
  });

  return transporter;
};

// Startup warning if config is missing — doesn't throw, but sends will fail
if (!SMTP_HOST || !SMTP_USER || !SMTP_KEY || !FROM_EMAIL) {
  logger.warn(
    "SMTP config incomplete — announcement email sends will fail. Need SMTP_HOST, SMTP_USER, SMTP_KEY, FROM_EMAIL.",
  );
}

interface SendEmailInput {
  to: string;
  firstName: string;
  announcement: Announcement;
  deliveryRowId: string;
}

export const sendEmail = async (input: SendEmailInput): Promise<string> => {
  if (!FROM_EMAIL) {
    throw new Error("FROM_EMAIL env var not set");
  }

  const severityLabel = formatSeverity(input.announcement.severity);
  const subject = `[${severityLabel}] ${input.announcement.title}`;

  const info = await getTransporter().sendMail({
    from: { name: FROM_NAME, address: FROM_EMAIL },
    to: input.to,
    subject,
    text: buildPlainText(input),
    html: buildHtml(input),
    // Custom header — helps tag outgoing mail if we ever need to trace it back.
    // Brevo doesn't surface this in webhooks the way SendGrid does with customArgs,
    // so for MVP we're accepting that per-delivery status tracking is best-effort.
    headers: {
      "X-Announcement-Delivery-Id": input.deliveryRowId,
      "X-Announcement-Id": input.announcement.id,
    },
  });

  // messageId is nodemailer's — not tied to Brevo's internal event ID, but
  // still useful to have for debugging.
  return info.messageId ?? "";
};

const formatSeverity = (severity: string | null): string => {
  switch (severity) {
    case "CRITICAL_RED": return "CRITICAL ALERT";
    case "CRITICAL_BLUE": return "ALERT UPDATE";
    case "ALL_CLEAR_GREEN": return "ALL CLEAR";
    default: return "ALERT";
  }
};

const buildPlainText = (input: SendEmailInput): string => {
  const { firstName, announcement } = input;
  const locationLine = announcement.location ? `Location: ${announcement.location}\n\n` : "";
  return `Hi ${firstName},

${announcement.title}

${announcement.body}

${locationLine}If you have information relevant to this alert, please contact CSUN Department of Police Services at (818) 677-2111.

— CampusConnect Alerts`;
};

const buildHtml = (input: SendEmailInput): string => {
  const { firstName, announcement } = input;
  const severityColor = announcement.severity === "CRITICAL_RED" ? "#CC0033"
    : announcement.severity === "CRITICAL_BLUE" ? "#1E40AF"
    : "#16A34A";
  const locationBlock = announcement.location
    ? `<p style="margin:16px 0;font-size:15px"><strong>Location:</strong> ${escapeHtml(announcement.location)}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
  <div style="background: ${severityColor}; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0; font-size: 20px;">${escapeHtml(formatSeverity(announcement.severity))}</h1>
  </div>
  <div style="padding: 24px;">
    <p>Hi ${escapeHtml(firstName)},</p>
    <h2 style="font-size: 22px; margin: 20px 0 12px;">${escapeHtml(announcement.title)}</h2>
    <p style="font-size: 16px;">${escapeHtml(announcement.body).replace(/\n/g, "<br>")}</p>
    ${locationBlock}
    <p style="margin-top: 24px; font-size: 14px; color: #666;">
      If you have information relevant to this alert, please contact CSUN Department of Police Services at <a href="tel:8186772111">(818) 677-2111</a>.
    </p>
  </div>
  <div style="background: #f5f5f5; padding: 16px; text-align: center; font-size: 12px; color: #666;">
    — CampusConnect Alerts
  </div>
</body>
</html>`;
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");