import prisma from "../../utils/prisma";
import {
  NotificationPreferencesData,
  UpdateNotificationPreferencesInput,
  AppearancePreferencesData,
  UpdateAppearancePreferencesInput,
  PrivacyPreferencesData,
  UpdatePrivacyPreferencesInput,
  BlockedUserData,
  BugReportInput,
} from "./settings.types";

// Notification Preferences

export const getNotificationPreferences = async (
  userId: string
): Promise<NotificationPreferencesData> => {
  const preferences = await prisma.userPreferences.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: {
      clubsNotifications: true,
      campusEventsNotifications: true,
      marketplaceNotifications: true,
      academicNotifications: true,
      followRequestNotifications: true,
    },
  });

  return preferences;
};

export const updateNotificationPreferences = async (
  userId: string,
  data: UpdateNotificationPreferencesInput
): Promise<NotificationPreferencesData> => {
  const updated = await prisma.userPreferences.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: {
      clubsNotifications: true,
      campusEventsNotifications: true,
      marketplaceNotifications: true,
      academicNotifications: true,
      followRequestNotifications: true,
    },
  });

  return updated;
};

// Appearance Preferences

export const getAppearancePreferences = async (
  userId: string
): Promise<AppearancePreferencesData> => {
  const preferences = await prisma.userPreferences.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: {
      theme: true,
      textSize: true,
    },
  });

  return preferences as AppearancePreferencesData;
};

export const updateAppearancePreferences = async (
  userId: string,
  data: UpdateAppearancePreferencesInput
): Promise<AppearancePreferencesData> => {
  const updated = await prisma.userPreferences.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: {
      theme: true,
      textSize: true,
    },
  });

  return updated as AppearancePreferencesData;
};

// Privacy Preferences 

export const getPrivacyPreferences = async (
  userId: string
): Promise<PrivacyPreferencesData> => {
  const preferences = await prisma.userPreferences.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: {
      accountVisibility: true,
      whoCanMessage: true,
      allowTagging: true,
    },
  });

  return preferences as PrivacyPreferencesData;
};

export const updatePrivacyPreferences = async (
  userId: string,
  data: UpdatePrivacyPreferencesInput
): Promise<PrivacyPreferencesData> => {
  const updated = await prisma.userPreferences.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: {
      accountVisibility: true,
      whoCanMessage: true,
      allowTagging: true,
    },
  });

  return updated as PrivacyPreferencesData;
};

export const getBlockedUsers = async (
  userId: string
): Promise<BlockedUserData[]> => {
  const blocked = await prisma.blockedUser.findMany({
    where: { blockerId: userId },
    include: {
      blocked: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profilePicture: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return blocked.map((b) => ({
    id: b.id,
    blockedId: b.blockedId,
    firstName: b.blocked.firstName,
    lastName: b.blocked.lastName,
    profilePicture: b.blocked.profilePicture,
    blockedAt: b.createdAt.toISOString(),
  }));
};

export const blockUser = async (
  blockerId: string,
  blockedId: string
): Promise<void> => {
  if (blockerId === blockedId) {
    throw new Error("You cannot block yourself");
  }

  await prisma.blockedUser.create({
    data: { blockerId, blockedId },
  });
};

export const unblockUser = async (
  blockerId: string,
  blockedId: string
): Promise<void> => {
  await prisma.blockedUser.deleteMany({
    where: { blockerId, blockedId },
  });
};

// Bug Report

export const submitBugReport = async (
  userId: string,
  data: BugReportInput
): Promise<void> => {
  await prisma.bugReport.create({
    data: {
      userId,
      title: data.title,
      category: data.category,
      severity: data.severity,
      description: data.description,
      steps: data.steps ?? null,
      browser: data.browser ?? null,
      attachments: data.attachments ?? [],
    },
  });
};