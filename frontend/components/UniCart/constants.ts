// src/components/UniCart/constants.ts
export const SEMESTERS = ["Spring 2026", "Fall 2026", "Summer 2026"];
export const HOURS = Array.from({ length: 15 }, (_, i) => i + 7);

export const rmpUrl = (professor: string) =>
  `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(professor)}`;

export const TAG_GROUPS: { label: string; tags: string[] }[] = [
  { label: "Department",    tags: ["COMP", "MATH", "ENGL", "ART", "BUS", "PHYS", "BIOL", "CHEM", "HIST", "PHIL", "PSYC", "SOC", "MUS", "KINE", "NURS", "ECE", "ME", "CE"] },
  { label: "Format",        tags: ["Online", "In-Person", "Hybrid", "Async", "Lab", "Lecture", "Seminar", "Studio"] },
  { label: "GE / Breadth",  tags: ["GE: Arts", "GE: Humanities", "GE: Social Sciences", "GE: Science", "GE: Quantitative Reasoning", "GE: Basic Skills", "GE: Lifelong Learning", "GE: US History"] },
  { label: "Level",         tags: ["Upper Division", "Lower Division", "Graduate"] },
  { label: "CS / Engineering", tags: ["CS Core", "CS Elective", "CS Required", "Engineering Core", "Engineering Elective"] },
  { label: "Availability",  tags: ["Open Seats", "Waitlist Available"] },
];

export const ALL_TAGS = ["All", ...TAG_GROUPS.flatMap((g) => g.tags)];

export const SCHEDULE_PALETTE = [
  "#A80532", "#2563eb", "#d97706", "#16a34a",
  "#7c3aed", "#0891b2", "#ea580c", "#64748b",
  "#db2777", "#059669",
];
