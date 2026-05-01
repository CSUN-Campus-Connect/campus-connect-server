import { Request, Response } from "express";
import {
  requestPasswordReset,
  resetPassword,
  validateResetToken,
} from "./password-reset.service";
import logger from "../../utils/logger";

// Request password reset validation handled by middleware
export const requestPasswordResetController = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { email } = req.body;
  try {
    const result = await requestPasswordReset(email);

    logger.info({ email, route: req.originalUrl, method: req.method }, "password.reset.request.success");
    return res.status(200).json(result);
  } catch (error) {
    logger.error({route: req.originalUrl, method: req.method, stack: error}, "password.reset.request.failed");
    return res.status(500).json({
      success: false,
      message: "Failed to process password reset request",
    });
  }
};

// Reset password with token 
export const resetPasswordController = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { token, password } = req.body;
    const result = await resetPassword(token, password);

    if (!result.success) {
      logger.warn({route: req.originalUrl, method: req.method, token: token ? "provided" : "missing"}, "password.reset.invalid_token");
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    logger.error({ stack: error, route: req.originalUrl, method: req.method}, "password.reset.failed.unexpectedly");
    return res.status(500).json({
      success: false,
      message: "Failed to reset password",
    });
  }
};

export const validateResetTokenController = async (req: Request, res: Response) => {
  const { token } = req.query;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ valid: false });
  }
  const valid = await validateResetToken(token);
  return res.status(200).json({ valid });
};