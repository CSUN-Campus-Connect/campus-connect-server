import nodemailer from "nodemailer";
import logger from "../../utils/logger";


// Load required env variables
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_KEY = process.env.SMTP_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL;
const FRONTEND_URL = process.env.FRONTEND_URL;

//mailer file using brevo SMTP
export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT) || 587,
  auth: {
    user: SMTP_USER,
    pass: SMTP_KEY,
  },
});

// Send password reset email with secure token link
export const sendPasswordResetEmail = async (to: string, resetToken: string, firstName: string) => {

  const resetUrl = `${FRONTEND_URL}/access/reset-password?token=${resetToken}`;

  const msg: nodemailer.SendMailOptions = {
    to,
    from: `CampusConnect <${FROM_EMAIL}>`,
    replyTo: FROM_EMAIL,
    subject: "Password Reset Request - CampusConnect",

    // Plain text version
    text: `Hi ${firstName},

You requested to reset your password for your CampusConnect account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this password reset, please ignore this email. Your password will remain unchanged.

Best,
CampusConnect Team
California State University, Northridge`,

    // Basic HTML version
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Password Reset Request</h2>
        
        <p>Hi <strong>${firstName}</strong>,</p>
        
        <p>You requested to reset your password for your CampusConnect account.</p>
        
        <p>Click the link below to reset your password:</p>
        
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        
        <p><strong>This link will expire in 1 hour.</strong></p>
        
        <p>If you didn't request this password reset, you can safely ignore this email.</p>
        
        <hr>
        
        <p style="font-size: 12px; color: #666;">
          CampusConnect<br>
          California State University, Northridge<br>
          This is an automated message, please do not reply.
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(msg);
    logger.info({
      to,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    }, `✅ Password reset email sent successfully to ${to}`);
    
  } catch (error: any) {
    logger.error({ 
      to, 
      error: error.message, 
      stack: error.stack,
      response: error.response?.body, 
    },`❌ Failed to send password reset email to ${to}`);
  
    if (error.response) {
      logger.error({ 
        to, 
        response: error.response 
      }, "SMTP response error details");
    }
    throw new Error("Failed to send password reset email");
  }

  logger.info({SMTP_HOST}, "SMTP Host");
  logger.info({SMTP_PORT}, "SMTP Port");
  logger.info({SMTP_USER}, "SMTP User");
  logger.info({FROM_EMAIL}, "From Email");

  await transporter.verify();
  logger.info("SMTP verified");
};