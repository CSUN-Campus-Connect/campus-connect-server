import type { MajorLevel, PlannerBuildRequest } from "./academics.types";

export function parseMajorLevel(input: unknown): MajorLevel {
  const s = String(input ?? "undergraduate").toLowerCase();
  return s === "graduate" ? "graduate" : "undergraduate";
}

export function requireString(value: unknown, field: string): string {
  const v = String(value ?? "").trim();
  if (!v) throw new Error(`${field} is required`);
  return v;
}

export function requireInt(value: unknown, field: string, def: number, min: number, max: number): number {
  const n = value == null || value === "" ? def : Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} must be a number`);
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function validatePlannerBuildBody(body: any): PlannerBuildRequest {
  return {
    majorName: requireString(body?.majorName, "majorName"),
    year: requireString(body?.year, "year"),
    level: body?.level ? parseMajorLevel(body.level) : undefined,
    limit: body?.limit != null ? requireInt(body.limit, "limit", 5, 1, 20) : undefined
  };
}
