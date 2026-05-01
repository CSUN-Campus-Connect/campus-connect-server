import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { sendPasswordResetEmail } from "./email.service";
import logger from "../../utils/logger";

const prisma = new PrismaClient();

interface RequestResetResult {
  success: boolean;
  message: string;
}

interface ResetPasswordResult {
  success: boolean;
  message: string;
}

// Request password reset - generates token n sends email
export const requestPasswordReset = async (
  email: string
): Promise<RequestResetResult> => {
  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // SECURITY: Always return success even if user not found
    if (!user) {
      logger.warn({ email }, "password.reset.request_for_nonexistent_email");
      return {
        success: true,
        message: "If that email exists, a reset link has been sent",
      };
    }

    // Generate secure random token (32 bytes = 64 hex characters)
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash token before storing in database
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Set token expiry (1 hour from now)
    const resetExpiry = new Date(
      Date.now() + parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRY || "3600000")
    );

    // Update user with reset token and expiry
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedToken,
        passwordResetExpiry: resetExpiry,
      },
    });

    // Send email with unhashed token
    await sendPasswordResetEmail(user.email, resetToken, user.firstName);

    logger.info({ email: user.email }, "password.reset.request.success");

    return {
      success: true,
      message: "If that email exists, a reset link has been sent",
    };
  } catch (error) {
    logger.error({ email, stack: (error as any).stack }, "password.reset.request.failed");
    throw new Error("Failed to process password reset request");
  }
};

// Reset password toekn 
export const resetPassword = async (
  token: string,
  password: string
): Promise<ResetPasswordResult> => {
  try {
    // Validate password length
    if (password.length < 8) {
      return {
        success: false,
        message: "Password must be at least 8 characters",
      };
    }

    // Hash the token to match database
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with valid token
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpiry: {
          gt: new Date(), // Token must not be expired
        },
      },
    });

    if (!user) {
      logger.warn({tokenProvided: !!token}, "password.reset.invalid_token");
      return {
        success: false,
        message: "Invalid or expired reset token",
      };
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHashed: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    logger.info({ userId: user.id, email: user.email }, "password.reset.success");

    return {
      success: true,
      message: "Password has been reset successfully",
    };
  } catch (error) {
    logger.error({ stack: (error as any).stack }, "password.reset.failed.unexpectedly");
    throw new Error("Failed to reset password");
  }
};

export const validateResetToken = async (token: string): Promise<boolean> => {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: hashedToken,
      passwordResetExpiry: { gt: new Date() },
    },
  });
  return !!user;
};