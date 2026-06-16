/**
 * User Controller
 * Handles user-related HTTP requests and responses.
 */
import { Request, Response, NextFunction } from "express";
import * as userService from "./auth.service";
import jwt from "jsonwebtoken";
import logger from "@/utils/logger";
import { parseUserAgent, getLocationFromIp } from "./auth.utils";

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
    const { refreshToken, user } = await userService.loginUser(email, password);
    const deviceLabel = parseUserAgent(req.headers["user-agent"] as string || "");
    const rawIp = req.ip || null;
    const cleanIp = rawIp?.replace("::ffff:", "") ?? null;
    const location = cleanIp ? await getLocationFromIp(cleanIp) : null;

    await userService.recordLoginHistory(
      user.id,
      deviceLabel,
      cleanIp,
      location,
    );
    const sessionId = await userService.createUserSession(
      user.id,
      deviceLabel,
      cleanIp,
    );
    const tokenWithSession = userService.generateAccessTokenWithSession(
      user.id,
      user.email,
      user.userType,
      sessionId,
    );
    logger.info({ userId: user.id }, "auth.login.success");
    res.status(200).json({
      message: "Login successful",
      token: tokenWithSession,
      refreshToken,
      sessionId,
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
    const user = req.user;
    if (!user) {
      return res.status(403).json({ message: "Unauthorized: User missing" });
    }

    // Re-decode the refresh token to recover the sessionId (if any) so the
    // new access token stays bound to the same session.
    const refreshToken = req.headers.authorization?.split(" ")[1];
    const decoded = refreshToken
      ? (jwt.decode(refreshToken) as { sessionId?: string } | null)
      : null;
    const sessionId = decoded?.sessionId;

    const payload = {
      id: user.id,
      email: user.email,
      userType: user.userType,
      ...(sessionId ? { sessionId } : {}),
    };

    const newAccessToken = await userService.refreshAccessToken(payload);

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

// Deletes user account, requires authentication and current password
export const deleteUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = (req as any).user?.id;
    if (!id)
      return res.status(401).json({ message: "Unauthorized: User ID missing" });

    const { password } = req.body;
    if (!password)
      return res.status(400).json({ message: "Password is required to delete your account" });

    const resp = await userService.deleteAccount(id, password);

    if (!resp) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    if (error instanceof Error && error.message === "Incorrect password") {
      return res.status(401).json({ message: "Incorrect password" });
    }
    next(error);
  }
};

// Search users by name or email
export const searchUsersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const q = (req.query.q as string)?.trim() ?? "";
    const requestingUserId = (req as any).user?.id;

    if (!requestingUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!q || q.length < 2) {
      return res.status(200).json([]);
    }

    const users = await userService.searchUsers(q, requestingUserId);
    logger.info({ q, resultCount: users.length }, "user.search.success");
    res.status(200).json(users);
  } catch (error) {
    logger.error(error, "user.search.failed");
    next(error);
  }
};

export const changePasswordHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = (req.user ?? (req as any).user)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User ID missing" });
    }

    const { currentPassword, newPassword } = req.body;

    await userService.changePassword(userId, currentPassword, newPassword);

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "Current password is incorrect" ||
        error.message === "New password must be different from your current password"
      ) {
        return res.status(400).json({ message: error.message });
      }
    }

    logger.error(error, "auth.change_password.failed");
    next(error);
  }
};

// Logs user out by deleting their session, requires session ID and authentication
export const logoutHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "Session ID is required" });
    }

    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }
    const decoded = jwt.decode(token) as unknown as { id: string };

    await userService.logoutUser(sessionId, decoded.id);
    logger.info("auth.logout.success");
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    logger.error(error, "auth.logout.failed");
    next(error);
  }
};

// Returns active sessions and current session ID for the user
export const getSessionsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const currentSessionId = (req as any).user?.sessionId; 
    const sessions = await userService.getUserSessions(userId);
    return res.status(200).json({ sessions, currentSessionId });
  } catch (error) {
    next(error);
  }
};

// Returns the 20 most recent login history entries for the user
export const getLoginHistoryHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const history = await userService.getLoginHistory(userId);
    return res.status(200).json({ history });
  } catch (error) {
    next(error);
  }
};

// Revokes a single specific session by ID used by the "End session" button per device
export const revokeSessionByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    const sessionId = req.params.sessionId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (typeof sessionId !== "string") {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const currentSessionId = req.user?.sessionId;

    if (currentSessionId && sessionId === currentSessionId) {
      return res.status(400).json({
        message: "Use /logout to end your current session",
      });
    }

    const deleted = await userService.revokeSessionById(userId, sessionId);

    if (!deleted) {
      return res.status(404).json({ message: "Session not found" });
    }

    return res.status(200).json({ message: "Session ended" });
  } catch (error) {
    next(error);
  }
};

// Signs the user out of all other devices by revoking sessions (execpt current session)
export const revokeOtherSessionsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const { currentSessionId } = req.body;

    if (!currentSessionId) {
      return res.status(400).json({ message: "Current session ID is required" });
    }

    await userService.revokeOtherSessions(userId, currentSessionId);
    return res.status(200).json({ message: "Other sessions revoked" });
  } catch (error) {
    next(error);
  }
};

// PUT /me/push-token — save the caller's Expo push token
export const updatePushTokenHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "unauthorized", message: "Not authenticated" });
      return;
    }

    const { expoPushToken } = req.body as { expoPushToken?: string };

    // Expo tokens always look like ExponentPushToken[...] or ExpoPushToken[...]
    if (
      !expoPushToken ||
      typeof expoPushToken !== "string" ||
      !(
        expoPushToken.startsWith("ExponentPushToken[") ||
        expoPushToken.startsWith("ExpoPushToken[")
      )
    ) {
      res.status(400).json({
        error: "invalid_token",
        message: "Invalid Expo push token format",
      });
      return;
    }

    await userService.updateExpoPushToken(userId, expoPushToken);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to update push token");
    res.status(500).json({ error: "server_error", message: "Could not save push token" });
  }
};

// DELETE /me/push-token — clear token on logout
export const clearPushTokenHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "unauthorized", message: "Not authenticated" });
      return;
    }

    await userService.clearExpoPushToken(userId);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to clear push token");
    res.status(500).json({ error: "server_error", message: "Could not clear push token" });
  }
};

export const updatePhoneHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { phoneNumber, emergencyAlertsOptIn } = req.body;

    await userService.updatePhone(
      userId,
      phoneNumber?.trim() || null,
      emergencyAlertsOptIn ?? true,
    );

    return res.status(200).json({ message: "Phone updated successfully" });
  } catch (error) {
    logger.error(error, "auth.update_phone.failed");
    next(error);
  }
};