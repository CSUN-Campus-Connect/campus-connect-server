/**
 * User Controller
 * Handles user-related HTTP requests and responses.
 */
import { Request, Response, NextFunction } from "express";
import * as userService from "./auth.service";
import logger from "@/utils/logger";

// Get all users
export const getAllUsersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const users = await userService.getAllUsers();
    logger.info({ userCount: users.length }, "user.fetch_all.success");
    res.status(200).json(users);
  } catch (error) {
    logger.error(error, "user.fetch_all.failed");
    next(error);
  }
};

export const registerUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const newUser = await userService.registerUser(req.body);
    logger.info({ userId: newUser.id }, "auth.register.success");
    res.status(201).json({
      message: "User registered successfully",
      user: newUser,
    });
  } catch (error) {
    logger.error(error, "auth.register.failed");
    next(error);
  }
};

export const loginUserHandler = async (
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  try {
    const { email, password } = req.body;
    const { token, user } = await userService.loginUser(email, password);
    logger.info({ userId: user.id }, "auth.login.success");
    res.status(200).json({
      message: "Login successful",
      token,
      user,
    });
  } catch (error: unknown) {
    // Email not verified
    if (error instanceof Error) {
      if (error.message === "Please verify your email before logging in") {
        logger.warn(error, "auth.login.email_not_verified");
        return res.status(403).json({
          success: false,
          message: "Please verify your email before logging in",
        });
      }

      // Invalid credentials
      if (error.message === "Invalid email or password") {
        logger.warn("auth.login.invalid_credentials");
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // Generic error
      logger.error(error, "auth.login.failed");
      return res.status(500).json({
        success: false,
        message: error.message || "Login failed",
      });
    }

    logger.error(error, "auth.login.unknown_error");
    return res.status(500).json({
      success: false,
      message: "An unknown error occurred during login",
    });
  }
};

// Refresh token
export const refreshAccessTokenHandler = async (
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(403).json({ message: "Unauthorized: User missing" });
    }

    const newAccessToken = await userService.refreshAccessToken(user);

    if (!newAccessToken) {
      return res.status(403).json({ message: "Invalid new access token" });
    }

    res.status(201).json({ accessToken: newAccessToken });
  } catch (error: any) {
    // Send proper JSON error responses
    console.error("Login error:", error.message);

    // Email not verified
    if (error instanceof Error) {
      if (error.message === "Please verify your email before logging in") {
        logger.warn(error, "auth.login.email_not_verified");
        return res.status(403).json({
          success: false,
          message: "Please verify your email before logging in",
        });
      }

      // Invalid credentials
      if (error.message === "Invalid email or password") {
        logger.warn("auth.login.invalid_credentials");
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // Generic error
      logger.error(error, "auth.login.failed");
      return res.status(500).json({
        success: false,
        message: error.message || "Login failed",
      });
    }

    logger.error(error, "auth.login.unknown_error");
    return res.status(500).json({
      success: false,
      message: "An unknown error occurred during login",
    });
  }
};

// Upsert user profile
export const upsertProfileHandler = async (
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const userId = (req as any).user?.id;
  try {
    if (!userId) {
      logger.warn(
        { ip: req.ip, route: req.originalUrl, method: req.method },
        "auth.unauthorized.missing_user_id",
      );
      return res.status(401).json({ message: "Unauthorized: User ID missing" });
    }

    const updatedProfile = await userService.upsertUserProfile(
      userId,
      req.body,
    );

    logger.debug({ userId }, "user.profile.upsert.success");

    return res.status(200).json({
      message: "Profile upserted successfully",
      data: updatedProfile,
    });
  } catch (error) {
    logger.error(error, "user.profile.upsert.failed");
    return res.status(500).json({ message: "Something went wrong" });
  }
};

// get current authenticated user
export const getCurrentUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // req.user is set by authenticateToken middleware
    if (!req.user) {
      logger.warn({ route: req.originalUrl }, "auth.current_user.unauthorized");
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    res.status(200).json({
      user: req.user,
    });
  } catch (error) {
    logger.error(error, "auth.current_user.failed");
    next(error);
  }
};

// get public user profile via user id
export const getPublicProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = req.params.id as string;

    if (!id) return res.status(400).json({ error: "User id missing" });

    const profile = await userService.publicProfile(id as string);
    
    res.status(200).json(profile);
  } catch (error) {
    logger.error(error, "user.public_profile.failed");
    next(error);
  }
};

// Verifies user's email using token sent via SendGrid
export const verifyEmailHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Invalid token" });
    }

    const user = await userService.verifyUserEmail(token);

    logger.info({ userId: user.id }, "auth.email.verify.success");
    res.status(200).json({ message: "Email verified successfully!" });
  } catch (error) {
    logger.error(error, "auth.email.verify.failed");
    next(error);
  }
};

// Resends a new email verification link to the user
export const resendVerificationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    await userService.resendVerification(email);

    logger.debug({ email }, "auth.email.resend_verification.success");
    res.status(200).json({ message: "Verification email resent" });
  } catch (error) {
    next(error);
  }
};

// Deletes user account
export const deleteUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = (req as any).user?.id;
    if (!id)
      return res.status(401).json({ message: "Unauthorized: User ID missing" });

    const resp = await userService.deleteAccount(id);

    if (!resp) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    next(error);
  }
};
