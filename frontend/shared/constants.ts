// shared/constants.ts
export const BG = "linear-gradient(160deg, #8b0000 0%, #A80532 35%, #c0182a 60%, #6b0f2a 100%)";

export const btnPrimary = {
  bgcolor: "#A80532",
  "&:hover": { bgcolor: "#810326" },
  fontWeight: 900,
  borderRadius: "10px",
  textTransform: "none" as const,
  boxShadow: "0 2px 8px rgba(168,5,50,0.30)",
};

export const btnGhost = {
  color: "rgba(255,255,255,0.80)",
  borderColor: "rgba(255,255,255,0.25)",
  fontWeight: 700,
  borderRadius: 999,
  fontSize: "0.78rem",
  bgcolor: "rgba(255,255,255,0.08)",
  backdropFilter: "blur(8px)",
  "&:hover": { bgcolor: "rgba(255,255,255,0.15)", borderColor: "rgba(255,255,255,0.45)" },
};

export interface UniCartClass {
  id: string;
  sectionId: string;
  subject: string;
  number: string;
  title: string;
  units: number;
  semester: string;
  professor: string;
  days?: string[];
  startTime: string;
  endTime: string;
  location?: string;
  isOnline: boolean;
  seats?: number;
  seatsAvailable?: number;
  waitlistCount?: number;
  courseType?: string;
  linkedLab?: string;
  materialCost?: number;
  prerequisites?: string[];
  tags?: string[];
  description?: string;
}

export const SEMESTERS = ["Spring 2026", "Fall 2026", "Summer 2026"];
