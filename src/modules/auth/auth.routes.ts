/**
 * User Router
 * Defines routes for user-related operations.
 */

import { Router } from "express";
import * as userController from "./auth.controller";
import { validate } from "@/middleware/validateRequest";
import { upsertProfileSchema } from "./auth.validation";
import {
  authenticateToken,
  authenticateRefreshToken,
} from "@/middleware/auth.middleware";
import {
  requestPasswordResetController,
  resetPasswordController,
  validateResetTokenController,
} from "./password-reset.controller";

import {
  requestPasswordResetSchema,
  resetPasswordSchema,
} from "./password-reset.validation";
import { LoginSchema, RegisterSchema } from "./auth.schemas";
import { ChangePasswordSchema } from "./auth.schemas";

const router = Router();

// GET /api/v1/users - Get all users (development only)
if (process.env.NODE_ENV === "development") {
  router.get("/", userController.getAllUsersHandler);
}

// POST /api/v1/users/register - Register a new user
router.post(
  "/register",
  validate(RegisterSchema),
  userController.registerUserHandler,
);

// POST /api/v1/users/login - Login a user
router.post("/login", validate(LoginSchema), userController.loginUserHandler);

// POST /api/v1/users/refresh - Refresh access token
router.post(
  "/refresh",
  authenticateRefreshToken,
  userController.refreshAccessTokenHandler,
);

// GET /api/v1/users/me - Returns the currently authenticated user's data
router.get("/me", authenticateToken, userController.getCurrentUserHandler);

// GET /api/v1/users/search?q=... - Search users by name or email
router.get("/search", authenticateToken, userController.searchUsersHandler);

// GET /api/v1/users/verify?token=... - Email verification, marks user as verified if token is valid
router.get("/verify", userController.verifyEmailHandler);

// POST /api/v1/users/resend-verification
router.post("/resend-verification", userController.resendVerificationHandler);

// GET /api/v1/users/me - Returns the currently authenticated user's data
router.get("/me", authenticateToken, userController.getCurrentUserHandler);

// PATCH /api/v1/users/me/password - Change password
router.patch("/me/password", authenticateToken, validate(ChangePasswordSchema), userController.changePasswordHandler,);

// PATCH phone number
router.patch("/me/phone", authenticateToken, userController.updatePhoneHandler);

router.get("/validate-reset-token", validateResetTokenController);

// PUT /api/v1/users/upsert-profile - Upsert profile
router.put(
  "/upsert-profile",
  authenticateToken,
  validate(upsertProfileSchema),
  userController.upsertProfileHandler,
);

// POST /api/v1/users/request-password-reset - Request password reset
router.post(
  "/request-password-reset",
  validate(requestPasswordResetSchema),
  requestPasswordResetController,
);

// POST /api/v1/users/reset-password - Reset password
router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  resetPasswordController,
);

// POST /api/v1/users/logout - Logout user
router.post("/logout", authenticateToken, userController.logoutHandler);

// GET /api/v1/users/sessions - Get active sessions for the authenticated user
router.get("/sessions", authenticateToken, userController.getSessionsHandler);

// GET /api/v1/users/login-history - Get login history for the authenticated user
router.get("/login-history", authenticateToken, userController.getLoginHistoryHandler);

// POST /api/v1/users/sessions/revoke - Revoke a specific session by session ID
router.post("/sessions/revoke-all", authenticateToken, userController.revokeOtherSessionsHandler);

// Generic routes (must come LAST after specific routes)
// GET /api/v1/users/:id - Returns user public profile
router.get("/:id", userController.getPublicProfile);

// DELETE /api/v1/users/me - Delete user account
router.delete("/me", authenticateToken, userController.deleteUserHandler);

// Push token registration for mobile app
router.put(
  "/me/push-token",
  authenticateToken,
  userController.updatePushTokenHandler,
);

router.delete(
  "/me/push-token",
  authenticateToken,
  userController.clearPushTokenHandler,
);

export default router;