// Categorizes event typs and college categories for CSUN USU events 

export type EventType =
  | "Food"
  | "Social"
  | "Sports"
  | "Academics"
  | "Career"
  | "Arts"
  | "Volunteer"
  | "Other";

export type CollegeCategory =
  | "Engineering"
  | "Business"
  | "Arts & Media"
  | "Science & Math"
  | "Health & Human Development"
  | "Education"
  | "Social & Behavioral Sciences"
  | "General Campus";

export type CsunUsuEvent = {
  id: string;
  title: string;
  start: string; // ISO
  end?: string; // ISO
  location?: string;
  description?: string;
  eventType: EventType;
  collegeCategory: CollegeCategory;
};
