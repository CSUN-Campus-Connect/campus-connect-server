// Authentication: Verifies JWT tokens and sends user to request

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "@/utils/prisma";
import authConfig from "@/modules/auth/auth.config";
import { User } from "@prisma/client";

export interface JWTPayload {
  id: string;
  email: string;
  userType: string;
}

const getUserWithPayload = async (
  decoded: JWTPayload,
): Promise<Omit<User, "passwordHashed"> | null> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      omit: {
        passwordHashed: true,
      },
    });

    return user;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
};

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers["authorization"];
    const token = authHeader?.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        error: "Authentication required",
        message: "No token provided",
      });
      return;
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      authConfig.jwt_secret as string,
    ) as JWTPayload;

    // Get user from database
    const user = await getUserWithPayload(decoded);

    if (!user) {
      res.status(404).json({
        error: "Authentication failed",
        message: "User not found",
      });
      return;
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: "Authentication failed",
        message: "Invalid token",
      });
      return;
    } else if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: "Authentication failed",
        message: "Token expired",
      });
      return;
    } else {
      res.status(500).json({
        error: "Internal server error",
        message: "Authentication check failed",
      });
      return;
    }
  }
};

export const authenticateRefreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers["authorization"];
  const refreshToken = authHeader?.split(" ")[1];
  if (!refreshToken) {
    res.status(401).json({
      error: "Authentication required",
      message: "No token provided",
    });
    return;
  }

  try {
    // Verify access token
    const decoded = jwt.verify(
      refreshToken,
      authConfig.refresh_secret as string,
    ) as JWTPayload;

    // Get user from database
    const user = await getUserWithPayload(decoded);

    if (!user) {
      res.status(404).json({
        error: "Authentication failed",
        message: "User not found",
      });
      return;
    }
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({
        error: error,
        message: "Invalid refresh token",
      });
    } else if (error instanceof jwt.TokenExpiredError) {
      res.status(403).json({
        error: "Authentication failed",
        message: "Refresh token expired",
      });
    } else {
      res.status(500).json({
        error: error,
        message: "Internal server error",
      });
    }
  }
};
