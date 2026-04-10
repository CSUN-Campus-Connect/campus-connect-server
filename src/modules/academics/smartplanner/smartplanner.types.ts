export type MajorLevel = "undergraduate" | "graduate";

export type MajorHit = {
  id: string;
  name: string;
  type: string | null;
  category: string | null;
};

export type RoadmapLink = {
  title: string;
  url: string;
};

export type ParsedRoadmapCourse = {
  raw: string;
  courseKey?: string;
  subject?: string;
  catalog?: string;
  notes?: string;
};

export type ParsedSemester = {
  label: string;
  courses: ParsedRoadmapCourse[];
};

export type ParsedRoadmap = {
  title: string;
  semesters: ParsedSemester[];
};

export type CourseKey = string;

export type PrereqExpr =
  | { kind: "course"; course: CourseKey }
  | { kind: "and"; items: PrereqExpr[] }
  | { kind: "or"; items: PrereqExpr[] }
  | { kind: "unknown"; text: string };

export type RequirementGraphNode = {
  key: CourseKey;
  title?: string | null;
  units?: number | null;
  prereq?: PrereqExpr;
};

export type RequirementGraphEdge = { from: CourseKey; to: CourseKey };

export type PlannerBuildRequest = {
  majorName: string;
  year: string;
  level?: MajorLevel;
  limit?: number;
};

export type ElectiveGroup = {
  id: string;
  label: string;
  /* "roadmap" = detected from the roadmap page; "catalog" = scraped from the catalog program page */
  source: "roadmap" | "catalog";
  semesterHint: string;
  /* min units the student must pick from this group */
  minUnits?: number;
  /* max units the student may pick from this group */
  maxUnits?: number;
  options: Array<{ courseKey: string; raw: string; units?: number }>;
  chosen: string | null;
};

export type PlannerBuildResponse = {
  majorName: string;
  year: string;
  /* Reference url for CSUN catalog page run feature with program (used to scrape electives) */
  catalogUrl?: string;
  matchedRoadmap: RoadmapLink;
  roadmap: ParsedRoadmap;
  graph: {
    nodes: RequirementGraphNode[];
    edges: RequirementGraphEdge[];
  };
  courses: string[];
};

export type SuggestRoadmapsResponse = {
  majorName: string;
  year: string;
  results: Array<RoadmapLink & { score: number }>;
};
