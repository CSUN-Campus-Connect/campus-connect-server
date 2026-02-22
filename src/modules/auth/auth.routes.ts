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
} from "./password-reset.controller";

import {
  requestPasswordResetSchema,
  resetPasswordSchema,
} from "./password-reset.validation";
import { LoginSchema, RegisterSchema } from "./auth.schemas";

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

// GET /api/v1/users/:id - Returns user public profile
router.get("/:id", userController.getPublicProfile);

// GET /api/v1/users/verify?token=... - Email verification, marks user as verified if token is valid
router.get("/verify", userController.verifyEmailHandler);

// POST /api/v1/users/resend-verification
router.post("/resend-verification", userController.resendVerificationHandler);

// GET /api/v1/users/me - Returns the currently authenticated user's data
router.get("/me", authenticateToken, userController.getCurrentUserHandler);

// DELETE /api/v1/users/:id
router.delete("/:id", authenticateToken, userController.deleteUserHandler);

// PUT /api/v1/users/upsert-profile - Upsert profile
router.put(
  "/upsert-profile",
  authenticateToken,
  validate(upsertProfileSchema),
  userController.upsertProfileHandler,
);

// Password reset with validation
router.post(
  "/request-password-reset",
  validate(requestPasswordResetSchema),
  requestPasswordResetController,
);

router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  resetPasswordController,
);

export default router;
