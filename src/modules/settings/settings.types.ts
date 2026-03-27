export interface NotificationPreferencesData {
  clubsNotifications: boolean;
  campusEventsNotifications: boolean;
  marketplaceNotifications: boolean;
  academicNotifications: boolean;
  followRequestNotifications: boolean;
}

export interface UpdateNotificationPreferencesInput {
  clubsNotifications?: boolean;
  campusEventsNotifications?: boolean;
  marketplaceNotifications?: boolean;
  academicNotifications?: boolean;
  followRequestNotifications?: boolean;
}

export interface AppearancePreferencesData {
  theme: "light" | "dark";
  textSize: "small" | "medium" | "large" | "extra-large";
}

export interface UpdateAppearancePreferencesInput {
  theme?: "light" | "dark";
  textSize?: "small" | "medium" | "large" | "extra-large";
}

export interface PrivacyPreferencesData {
  accountVisibility: "everyone" | "friends";
  whoCanMessage: "everyone" | "friends" | "nobody";
  allowTagging: boolean;
}

export interface UpdatePrivacyPreferencesInput {
  accountVisibility?: "everyone" | "friends";
  whoCanMessage?: "everyone" | "friends" | "nobody";
  allowTagging?: boolean;
}

export interface BlockedUserData {
  id: string;
  blockedId: string;
  firstName: string;
  lastName: string;
  profilePicture: string | null;
  blockedAt: string;
}

export interface BugReportInput {
  title: string;
  category: string;
  severity: string;
  description: string;
  steps?: string;
  browser?: string;
  attachments?: string[];
}
