/**
 * User Service
 * Contains business logic for user-related operations.
 * Contains methods interacting with the database.
 */
import prisma from "@/utils/prisma";
import { PublicUser } from "./auth.types";
import bcrypt from "bcrypt";
import { UserType } from "@prisma/client";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { sendVerificationEmail } from "@/utils/sendgrid.service";
import logger from "@/utils/logger";
import authConfig from "./auth.config";
import { JWTPayload } from "@/middleware/auth.middleware";  

// Helper: converts full user object to PublicUser
export const toPublicUser = (user: any): PublicUser => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  isVerified: user.isVerified,
  profilePicture: user.profilePicture,
  bio: user.bio,
  userType: user.userType,
  city: user.city,
  websites: user.websites,
  createdAt: user.createdAt,
});

// Helper: Generates verification token for email verification
export const generateVerificationToken = () => {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 3600 * 1000);
  return { token, expires };
};

// Get all users
export const getAllUsers = async (): Promise<PublicUser[]> => {
  const users = await prisma.user.findMany({
    omit: {
      passwordHashed: true,
    },
  });

  return users;
};

// Register a new user and initiate email verification
export const registerUser = async (userData: any): Promise<PublicUser> => {
  const { email, password, firstName, lastName } = userData;

  logger.info({ email }, "Attempting to register user");

  // Check for email if it already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    throw new Error("Email already in use");
  }

  // Vaid CSUN EMAIL
  if (!email.toLowerCase().endsWith("@my.csun.edu")) {
    throw new Error("Only @my.csun.edu email addresses are allowed");
  }

  // Hash password
  const saltRounds = authConfig.salt_rounds;
  const passwordHashed = await bcrypt.hash(password, saltRounds);

  // Generate email verification token with 1 hour expiration
  const { token, expires } = generateVerificationToken();

  let newUser;

  try {
    // Create a new user record with verification metadata
    newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHashed,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        userType: UserType.student,
        verificationToken: token,
        verificationTokenExpiration: expires,
        isVerified: false,
      },
    });

    // Send verification email to user's email
    await sendVerificationEmail(newUser.email, token);

    return toPublicUser(newUser);
  } catch (error) {
    // Roll back the user record if any part of registration fails
    if (newUser) {
      await prisma.user.delete({
        where: { id: newUser.id },
      });
    }
    throw new Error("Failed to register user. Please try again.", {
      cause: error,
    });
  }
};

// Verify a user's email using the verification token and activate their account
export const verifyUserEmail = async (token: string) => {
  const user = await prisma.user.findFirst({
    where: {
      verificationToken: token,
      verificationTokenExpiration: { gte: new Date() },
    },
  });

  if (!user) {
    throw new Error("Invalid or expired token");
  }

  // Mark account as verified and clear token fields
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      isVerified: true,
      verificationToken: null,
      verificationTokenExpiration: null,
    },
  });

  return toPublicUser(updatedUser);
};

// Resends a new verification email to the user
export const resendVerification = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.isVerified) {
    throw new Error("User already verified");
  }

  const { token, expires } = generateVerificationToken();

  // Updates DB with new token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      verificationToken: token,
      verificationTokenExpiration: expires,
    },
  });

  await sendVerificationEmail(user.email, token);
};

// Login a user
export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  logger.info({ email }, "Attempting to login user");

  if (!user) {
    throw new Error("Invalid email or password");
  }

  // Block login until email is verified
  if (!user.isVerified) {
    throw new Error("Please verify your email before logging in");
  }

  // Check is password is correct
  const passwordValid = await bcrypt.compare(password, user.passwordHashed);
  if (!passwordValid) {
    throw new Error("Invalid email or password");
  }

  // Generate a JWT token
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      userType: user.userType,
    },
    authConfig.jwt_secret as string,
    { expiresIn: authConfig.jwt_expires_in as any },
  );
  
  const refreshToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      userType: user.userType,
    },
    authConfig.refresh_secret as string,
    { expiresIn: authConfig.refresh_expires_in as any },
  );

  // Return token and user info
  return { token, refreshToken, user: toPublicUser(user) };
};

// Refresh access token
export const refreshAccessToken = async (user: JWTPayload) => {
  try {
    const newAccessToken = jwt.sign(user, authConfig.jwt_secret as string, {
      expiresIn: authConfig.jwt_expires_in as any,
    });

    return newAccessToken;
  } catch (error) {
    throw new Error("Invalid token", { cause: error });
  }
};

// Upsert user profile
export const upsertUserProfile = async (
  userId: string,
  userData: any,
): Promise<PublicUser> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User Id not found");
  }

  const profileData = {
    firstName: userData.first,
    lastName: userData.last,
    email: userData.email,
    profilePicture: userData.profilePicture,
    bio: userData.bio,
    city: userData.city,
    websites: userData.websites,
  };

  const updatedProfile = await prisma.user.update({
    where: { id: userId },
    data: { ...profileData },
  });

  return toPublicUser(updatedProfile);
};

// Get user public profile
export const publicProfile = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) throw new Error("Invalid user id:" + id);

  return toPublicUser(user);
};

// Deletes account using id with auth token
export const deleteAccount = async (id: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error("Invalid user id: " + id);

  const passwordValid = await bcrypt.compare(password, user.passwordHashed);
  if (!passwordValid) throw new Error("Incorrect password");

  return prisma.user.delete({ where: { id } });
};

// Seaerch Users by name or email (excludes self)
export const searchUsers = async (q: string, excludeId: string): Promise<PublicUser[]> => {
  const users = await prisma.user.findMany({
    where: {
      AND: [
        { id: { not: excludeId } },
        { isVerified: true },
        {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profilePicture: true,
      bio: true,
      userType: true,
      city: true,
      websites: true,
      isVerified: true,
      createdAt: true,
    },
    take: 20,
  });

  return users as PublicUser[];
};

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) throw new Error("User not found");

  const ok = await bcrypt.compare(currentPassword, user.passwordHashed);
  if (!ok) throw new Error("Current password is incorrect");

  const sameAsOld = await bcrypt.compare(newPassword, user.passwordHashed);
  if (sameAsOld) {
    throw new Error("New password must be different from your current password");
  }

  const saltRounds = authConfig.salt_rounds;
  const passwordHashed = await bcrypt.hash(newPassword, saltRounds);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHashed },
  });

  return true;
};

// Logs the first login per device each day 
export const recordLoginHistory = async (
  userId: string,
  deviceLabel: string,
  ipAddress: string | null,
  location: string | null,
): Promise<void> => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const existing = await prisma.loginHistory.findFirst({
    where: { userId, deviceLabel, createdAt: { gte: startOfDay } },
  });

  if (existing) return;

  const cleanIp = ipAddress?.replace("::ffff:", "") ?? null;

  await prisma.loginHistory.create({
    data: { userId, deviceLabel, ipAddress: cleanIp, location },
  });
};

// Creates a new session or refreshes an existing one for the same device.
export const createUserSession = async (
  userId: string,
  deviceLabel: string,
  ipAddress: string | null,
): Promise<string> => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const existing = await prisma.userSession.findFirst({
    where: { userId, deviceLabel },
  });

  if (existing) {
    const updated = await prisma.userSession.update({
      where: { id: existing.id },
      data: { ipAddress, expiresAt, lastActiveAt: new Date() },
    });
    return updated.id;
  }

  const session = await prisma.userSession.create({
    data: { userId, deviceLabel, ipAddress, expiresAt },
  });
  return session.id;
};

// Deletes a session by session and user ID for login and session management
export const logoutUser = async (sessionId: string, userId: string): Promise<void> => {
  await prisma.userSession.deleteMany({
    where: { id: sessionId, userId },
  });
};

// Generates a JWT access token with the session ID included
export const generateAccessTokenWithSession = (
  userId: string,
  email: string,
  userType: string,
  sessionId: string,
): string => {
  return jwt.sign(
    { id: userId, email, userType, sessionId },
    authConfig.jwt_secret as string,
    { expiresIn: authConfig.jwt_expires_in as any },
  );
};

// Returns non-expired sessions, ordered by most recently active.
export const getUserSessions = async (userId: string) => {
  return prisma.userSession.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: "desc" },
  });
};

// Returns recent login history, ordered by most recent and limited to 20 entries.
export const getLoginHistory = async (userId: string) => {
  return prisma.loginHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
};

export const revokeOtherSessions = async (
  userId: string,
  currentSessionId: string,
): Promise<void> => {
  await prisma.userSession.deleteMany({
    where: { userId, id: { not: currentSessionId } },
  });
};