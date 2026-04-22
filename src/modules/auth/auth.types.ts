import { UserType } from "@prisma/client";

export interface PublicUser {
  id: string;
  email: string;
  phoneNumber: string | null;
  emergencyAlertsOptIn: boolean;
  firstName: string;
  lastName: string;
  isVerified: boolean;
  profilePicture: string | null;
  bio: string | null;
  userType: UserType;
  city: string | null;
  websites: string[] | null;
  createdAt: Date;
}