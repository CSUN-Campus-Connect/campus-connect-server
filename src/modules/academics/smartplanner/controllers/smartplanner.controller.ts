import type { Request, Response } from "express";
import {
  buildPlanner,
  buildRequirementsGraph,
  fetchCatalogElectives,
  listCatalogYears,
  listRoadmapDepartments,
  listRoadmapsForDepartment,
  parseRoadmap,
  searchMajors,
  suggestRoadmaps
} from "../services/smartplanner.service";
import type { ElectiveGroup, PlannerElectiveChoice, PlannerElectiveOption } from "../smartplanner.types";
import { parseMajorLevel, requireInt, requireString, validatePlannerBuildBody } from "../smartplanner.validation";

/* ─────────────────────────────────────────────────────────────
   Existing route handlers (unchanged)
───────────────────────────────────────────────────────────── */
export async function majorsSearch(req: Request, res: Response) {
  try {
    const query = String(req.query.query ?? "");
    const level = parseMajorLevel(req.query.level);
    const results = await searchMajors(query, level);
    return res.json({ level, count: results.length, results });
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Failed" }); }
}
export async function catalogYears(_req: Request, res: Response) {
  try { return res.json({ years: listCatalogYears() }); }
  catch (e: any) { return res.status(500).json({ error: e?.message || "Failed" }); }
}
export async function roadmapsDepartments(_req: Request, res: Response) {
  try { return res.json({ results: await listRoadmapDepartments() }); }
  catch (e: any) { return res.status(500).json({ error: e?.message || "Failed" }); }
}
export async function roadmapsDepartment(req: Request, res: Response) {
  try {
    const slug = requireString(req.params.slug, "slug");
    return res.json({ slug, results: await listRoadmapsForDepartment(slug) });
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Failed" }); }
}
export async function roadmapsParse(req: Request, res: Response) {
  try {
    const url = requireString(req.query.url, "url");
    return res.json(await parseRoadmap(url));
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Failed" }); }
}
export async function requirementsGraph(req: Request, res: Response) {
  try {
    const courses = Array.isArray(req.body?.courses) ? req.body.courses : [];
    if (!courses.length) return res.status(400).json({ error: "courses required" });
    return res.json(await buildRequirementsGraph(courses));
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Failed" }); }
}
export async function roadmapsSuggest(req: Request, res: Response) {
  try {
    const majorName = requireString(req.query.majorName, "majorName");
    const year = requireString(req.query.year, "year");
    const limit = requireInt(req.query.limit, "limit", 5, 1, 20);
    return res.json(await suggestRoadmaps(majorName, year, limit));
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Failed" }); }
}
export async function plannerBuild(req: Request, res: Response) {
  try {
    const body = validatePlannerBuildBody(req.body);
    return res.json(await buildPlanner(body.majorName, body.year, body.limit ?? 5));
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Failed" }); }
}

/* ─────────────────────────────────────────────────────────────
   Pure helpers
───────────────────────────────────────────────────────────── */

/** "COMP-482" → { subject:"COMP", catalog:"482", levelBand:400 } */
function parseCourseKey(key: string) {
  const dash = key.indexOf("-");
  const subject = dash >= 0 ? key.slice(0, dash) : key;
  const catalog  = dash >= 0 ? key.slice(dash + 1) : "";
  const firstDigit = parseInt(catalog.charAt(0), 10);
  const levelBand  = Number.isFinite(firstDigit) ? firstDigit * 100 : 0;
  return { subject, catalog, levelBand };
}

/** Flatten a prereq expression tree into a flat list of course keys. */
function flattenPrereqs(prereq: any): string[] {
  if (!prereq) return [];
  if (prereq.kind === "course") return [prereq.course as string];
  if (prereq.kind === "and" || prereq.kind === "or")
    return (prereq.items as any[]).flatMap(flattenPrereqs);
  return [];
}

/** Deterministic HSL color from a string + index. */
function hashColor(str: string, index: number): string {
  let h = index * 73;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h % 360)},${68 + (Math.abs(h >> 8) % 17)}%,${48 + (Math.abs(h >> 16) % 12)}%)`;
}

function normalizeChosenCourseKey(raw: string): string {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "-");
}

function formatCourseLabel(raw: string, fallbackKey: string): string {
  const clean = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return fallbackKey.replace(/-/g, " ");
  const keyPrefix = fallbackKey.replace(/-/g, " ");
  if (clean.toUpperCase().startsWith(keyPrefix.toUpperCase())) {
    return clean.slice(keyPrefix.length).replace(/^\s*[–\-:]?\s*/, "").trim() || keyPrefix;
  }
  return clean;
}

function toPlannerElectiveChoices(options: ElectiveGroup["options"], excludeKeys?: Set<string>): PlannerElectiveChoice[] {
  const out: PlannerElectiveChoice[] = [];
  const seen = new Set<string>();
  for (const option of options ?? []) {
    const courseId = normalizeChosenCourseKey(option.courseKey);
    if (!courseId) continue;
    if (excludeKeys?.has(courseId)) continue;
    if (seen.has(courseId)) continue;
    seen.add(courseId);
    out.push({
      courseId,
      courseName: formatCourseLabel(option.raw, courseId),
      courseUnits: option.units,
    });
  }
  return out.sort((a, b) => a.courseId.localeCompare(b.courseId));
}

function isUpperDivisionCompElectiveKey(courseKey: string): boolean {
  const { subject, catalog } = parseCourseKey(courseKey);
  const n = parseInt(String(catalog).replace(/[^0-9].*$/, ""), 10);
  return subject === "COMP" && Number.isFinite(n) && n >= 400 && n < 600;
}

function buildElectiveOptions(
  electiveGroups: ElectiveGroup[],
  chosenElectives: Record<string, string>,
  alreadyScheduledKeys: Set<string> = new Set()
): PlannerElectiveOption[] {
  const out: PlannerElectiveOption[] = [];

  for (const g of electiveGroups) {
    const normalizedOptions = toPlannerElectiveChoices(g.options, alreadyScheduledKeys);
    const directChoice = chosenElectives[g.id] ? normalizeChosenCourseKey(chosenElectives[g.id]) : null;
    const slotChoices = Object.keys(chosenElectives)
      .filter(k => k.startsWith(`${g.id}__slot`) && chosenElectives[k])
      .map(k => normalizeChosenCourseKey(chosenElectives[k]));
    const isUpperDiv = /upper\s+division/i.test(g.label) || /400\s*or\s*500/i.test(g.label) || /400.*500/i.test(g.label);

    if (isUpperDiv) {
      const unitsPerSlot = 3;
      const totalUnits = g.minUnits ?? g.maxUnits ?? 3;
      const slotCount = Math.max(1, Math.ceil(totalUnits / unitsPerSlot));
      for (let i = 0; i < slotCount; i++) {
        const slotId = `${g.id}__slot${i + 1}`;
        const selected = chosenElectives[slotId] ? normalizeChosenCourseKey(chosenElectives[slotId]) : null;
        if (selected) continue;
        const remainingOptions = normalizedOptions.filter(opt => !slotChoices.includes(opt.courseId));
        out.push({
          id: slotId,
          label: `Computer Science Upper Division Elective (${i + 1} of ${slotCount})`,
          category: "Upper Division Elective",
          semesterLabel: g.semesterHint || `Later Semester ${i + 1}`,
          selected: null,
          options: remainingOptions,
          courseUnits: unitsPerSlot,
        });
      }
      continue;
    }

    if (directChoice || slotChoices.length > 0) continue;

    out.push({
      id: g.id,
      label: g.label,
      category: g.source === "catalog" ? "Catalog Choice" : "Roadmap Choice",
      semesterLabel: g.semesterHint || "Planned Semester",
      selected: null,
      options: normalizedOptions,
    });
  }

  return out.filter(option => (option.options?.length ?? 0) > 0 || /upper\s+division/i.test(option.label));
}

/* ─────────────────────────────────────────────────────────────
   Lab / lecture pairing

   A lab section key typically ends in "L" (e.g. "CHEM-101L",
   "BIOL-106L") or contains "LAB" in its title.
   Its paired lecture is the same prefix without the "L" suffix.

   Rule: labs and their parent lecture MUST be in the same semester.
   We enforce this by setting lab.minTier = lecture.minTier (after
   the topological sort), then locking them together in the packer.
───────────────────────────────────────────────────────────── */

/** Returns the lecture key for a lab, or null if not a lab. */
function getLectureKey(courseKey: string): string | null {
  // Pattern 1: key ends with "L"  e.g. CHEM-101L → CHEM-101
  if (/[A-Z]-\d+L$/.test(courseKey)) {
    return courseKey.replace(/L$/, "");
  }
  // Pattern 2: key ends with "D" (discussion sections used like labs) e.g. CHEM-101D
  if (/[A-Z]-\d+D$/.test(courseKey)) {
    return courseKey.replace(/D$/, "");
  }
  return null;
}

function isLabKey(courseKey: string): boolean {
  return getLectureKey(courseKey) !== null;
}

/* ─────────────────────────────────────────────────────────────
   Elective-group detection

   Scans the raw roadmap for rows that list multiple equivalent
   courses (OR alternatives). These become groups the user must
   choose one option from BEFORE the tree is built.
───────────────────────────────────────────────────────────── */
/* ElectiveGroup is imported from academics.types */

function detectElectiveGroups(roadmap: any): ElectiveGroup[] {
  const groups: ElectiveGroup[] = [];
  const coursePattern = /\b([A-Z]{2,6})\s*-?\s*([0-9]{2,4}[A-Z]?)\b/g;

  for (const sem of roadmap.semesters ?? []) {
    /* Case 1 – rows without a concrete courseKey but referencing multiple codes */
    const wildcardRows: any[] = (sem.courses ?? []).filter(
      (c: any) => !c.courseKey && c.raw?.trim()
    );
    for (const row of wildcardRows) {
      const raw: string = row.raw ?? "";
      coursePattern.lastIndex = 0;
      const found: Array<{ courseKey: string; raw: string }> = [];
      let m: RegExpExecArray | null;
      while ((m = coursePattern.exec(raw)) !== null)
        found.push({ courseKey: `${m[1]}-${m[2]}`, raw: `${m[1]} ${m[2]}` });

      if (found.length >= 2) {
        groups.push({
          id: `eg-${groups.length}`,
          label: raw.replace(coursePattern, "").replace(/\s{2,}/g, " ").trim() || raw,
          source: "roadmap",
          semesterHint: sem.label ?? "",
          options: found,
          chosen: null,
        });
      }
    }

    /* Case 2 – multiple keyed rows with the same label text */
    const keyedRows: any[] = (sem.courses ?? []).filter((c: any) => !!c.courseKey);
    const labelMap = new Map<string, Array<{ courseKey: string; raw: string }>>();

    for (const row of keyedRows) {
      const lbl = (row.notes ?? row.raw ?? "")
        .replace(coursePattern, "")
        .replace(/\s{2,}/g, " ")
        .trim()
        .toLowerCase();
      if (!lbl || lbl.length < 4) continue;
      const list = labelMap.get(lbl) ?? [];
      list.push({ courseKey: row.courseKey!, raw: row.raw ?? row.courseKey! });
      labelMap.set(lbl, list);
    }

    for (const [lbl, opts] of labelMap) {
      const hasLab = opts.some(o => isLabKey(o.courseKey));
      if (opts.length >= 2 && !hasLab) {
        groups.push({
          id: `eg-${groups.length}`,
          label: lbl.charAt(0).toUpperCase() + lbl.slice(1),
          source: "roadmap" as const,
          semesterHint: sem.label ?? "",
          options: opts,
          chosen: null,
        });
      }
    }
  }

  return groups;
}

/* ─────────────────────────────────────────────────────────────
   Topological tier assignment (DFS with memoization)

   Priority order for a course's tier:
   1. max(prereq tiers) + 1  — must be strictly AFTER all prerequisites
   2. floor((levelBand - 100) / 100)  — 100-level=0, 200-level=1, …
   Final tier = max(1, 2)
───────────────────────────────────────────────────────────── */
function assignMinTiers(
  nodeKeys: string[],
  prereqMap: Map<string, string[]>
): Map<string, number> {
  const cache  = new Map<string, number>();
  const inStack = new Set<string>();

  function dfs(key: string): number {
    if (cache.has(key)) return cache.get(key)!;
    if (inStack.has(key)) return 0; // cycle guard

    inStack.add(key);

    const knownPrereqs = (prereqMap.get(key) ?? []).filter(p => nodeKeys.includes(p));
    let fromPrereqs = -1;
    for (const p of knownPrereqs) fromPrereqs = Math.max(fromPrereqs, dfs(p));
    const prereqDepth = fromPrereqs + 1;

    const { levelBand } = parseCourseKey(key);
    const levelFloor = Math.max(0, Math.floor((levelBand - 100) / 100));

    const tier = Math.max(prereqDepth, levelFloor);
    cache.set(key, tier);
    inStack.delete(key);
    return tier;
  }

  for (const key of nodeKeys) dfs(key);
  return cache;
}

/* ─────────────────────────────────────────────────────────────
   Greedy unit-aware semester packing with lab co-scheduling

   Extra constraint: labs must land in the SAME semester as their
   paired lecture.  We achieve this by:
     a) Sorting so the lecture always comes before its lab.
     b) After placing the lecture, forcing the lab into the same
        semester (even if it slightly exceeds maxUnits, because a
        0-unit or 1-unit lab won't bust the cap meaningfully).
        We allow up to maxUnits + 2 for the lab-forced case.
───────────────────────────────────────────────────────────── */
interface PackableCourse {
  key: string;
  units: number;
  minTier: number;
  /** If set, this course must be co-scheduled with this lecture key */
  bundleWith?: string;
}

function packSemesters(
  courses: PackableCourse[],
  maxUnits: number
): Map<number, string[]> {
  // ── Unit range constraints ──────────────────────────────────────────────
  // Full-time: aim for 12–16 units/sem (minUnits=12 except when course pool
  // is too small to fill the semester).
  // Part-time: 6–11 units/sem.
  const minUnits = maxUnits >= 15 ? 12 : 6; // full-time → 12, part-time → 6

  // Build a quick lookup: lectureKey → labKey(s)
  // Includes both explicit L/D suffix labs AND title-based lab pairs (bundleWith)
  const labsForLecture = new Map<string, string[]>();
  for (const c of courses) {
    const lectKey = getLectureKey(c.key) ?? c.bundleWith;
    if (lectKey) {
      const arr = labsForLecture.get(lectKey) ?? [];
      arr.push(c.key);
      labsForLecture.set(lectKey, arr);
    }
  }

  // Sort: lectures before labs, then by minTier asc, then by subject to
  // cluster same-department courses together (reduces visual overlap).
  const isLab = (c: PackableCourse) => isLabKey(c.key) || !!c.bundleWith;
  const sorted = [...courses].sort((a, b) => {
    if (isLab(a) && !isLab(b)) return 1;
    if (!isLab(a) && isLab(b)) return -1;
    if (a.minTier !== b.minTier) return a.minTier - b.minTier;
    // Within the same tier, group by subject then level
    const subA = parseCourseKey(a.key).subject;
    const subB = parseCourseKey(b.key).subject;
    if (subA !== subB) return subA.localeCompare(subB);
    return parseCourseKey(a.key).levelBand - parseCourseKey(b.key).levelBand;
  });

  const semCourses: string[][] = [];
  const semUnits: number[] = [];
  // lectureKey → semesterIndex it was placed in
  const lectSemIdx = new Map<string, number>();

  // Helper: ensure index exists
  const ensureSem = (idx: number) => {
    while (semCourses.length <= idx) { semCourses.push([]); semUnits.push(0); }
  };

  for (const course of sorted) {
    // ── Lab / bundle: must co-schedule with its lecture ─────────────────────
    const bundleKey = getLectureKey(course.key) ?? course.bundleWith;
    if (bundleKey && lectSemIdx.has(bundleKey)) {
      const forcedSem = lectSemIdx.get(bundleKey)!;
      ensureSem(forcedSem);
      semCourses[forcedSem].push(course.key);
      semUnits[forcedSem] += course.units;
      continue;
    }

    // ── Regular course: find best semester ─────────────────────────────────
    // Strategy:
    //   1. Prefer an existing semester at or after minTier that has room
    //      AND is still below maxUnits.
    //   2. Among candidates, prefer the semester whose unit count is closest
    //      to (minUnits) so we fill semesters before opening new ones.
    //   3. Only open a new semester if no existing one can absorb the course.

    let bestSem = -1;
    let bestScore = Infinity;

    for (let s = course.minTier; s < semCourses.length; s++) {
      const after = semUnits[s] + course.units;
      if (after > maxUnits) continue; // over cap — skip
      // Score: distance from target fill (minUnits). Lower = better.
      // Prefer semesters already partially filled so we reach 12u before
      // opening a new one.
      const score = Math.abs(after - minUnits);
      if (score < bestScore) { bestScore = score; bestSem = s; }
    }

    if (bestSem >= 0) {
      semCourses[bestSem].push(course.key);
      semUnits[bestSem] += course.units;
      if (labsForLecture.has(course.key)) lectSemIdx.set(course.key, bestSem);
    } else {
      // Open a new semester at the required minTier
      const newIdx = Math.max(semCourses.length, course.minTier);
      ensureSem(newIdx);
      semCourses[newIdx].push(course.key);
      semUnits[newIdx] += course.units;
      if (labsForLecture.has(course.key)) lectSemIdx.set(course.key, newIdx);
    }
  }

  const result = new Map<number, string[]>();
  for (let i = 0; i < semCourses.length; i++) {
    if (semCourses[i].length > 0) result.set(i, semCourses[i]);
  }
  return result;
}

/* ─────────────────────────────────────────────────────────────
   /api/academics/planner/elective-groups  (called FIRST)
───────────────────────────────────────────────────────────── */
export async function electiveGroupsFetch(req: Request, res: Response) {
  try {
    const body = req.body ?? {};
    const majorName = requireString(body.majorName, "majorName");
    const year      = requireString(body.year, "year");
    const limit     = body.limit != null ? requireInt(body.limit, "limit", 5, 1, 20) : 5;

    const plannerResult = await buildPlanner(majorName, year, limit);
    const roadmapGroups = detectElectiveGroups(plannerResult.roadmap);

    // Fetch electives from the catalog program page (the real source of truth)
    const catalogGroups = plannerResult.catalogUrl
      ? await fetchCatalogElectives(plannerResult.catalogUrl)
      : [];

    // Merge: catalog groups take precedence (they are more accurate).
    // De-dup by checking if a catalog group's options overlap a roadmap group.
    const roadmapOnlyGroups = roadmapGroups.filter(rg =>
      !catalogGroups.some(cg =>
        cg.options.some(co =>
          rg.options.some(ro => ro.courseKey === co.courseKey)
        )
      )
    );

    const electiveGroups: ElectiveGroup[] = [...catalogGroups, ...roadmapOnlyGroups];

    return res.json({
      majorName, year,
      matchedRoadmap: plannerResult.matchedRoadmap,
      catalogUrl: plannerResult.catalogUrl ?? null,
      electiveOptions: buildElectiveOptions(electiveGroups, {}, new Set(plannerResult.graph.nodes.map(n => n.key))),
      electiveGroups,
    });
  } catch (e: any) {
    console.error("electiveGroupsFetch:", e);
    return res.status(500).json({ error: e?.message || "Failed to fetch elective groups" });
  }
}

/* ─────────────────────────────────────────────────────────────
   /api/academics/planner/skill-tree  (main build)
───────────────────────────────────────────────────────────── */
export async function skillTreeBuild(req: Request, res: Response) {
  try {
    const body      = req.body ?? {};
    const majorName = requireString(body.majorName, "majorName");
    const year      = requireString(body.year, "year");
    const limit     = body.limit != null ? requireInt(body.limit, "limit", 5, 1, 20) : 5;
    const pace: "full-time" | "part-time" =
      body.pace === "part-time" ? "part-time" : "full-time";
    // Full-time: 12–15 units/semester (15 hard cap keeps workload sane).
    // Part-time: 6–11 units/semester.
    const maxUnitsPerSem = pace === "full-time" ? 18 : 11;
    const minUnitsPerSem = pace === "full-time" ? 12 : 6;
    const chosenElectives: Record<string, string> = body.chosenElectives ?? body.selectedElectives ?? {};

    // ── 1. Fetch ────────────────────────────────────────────────────────────
    const plannerResult = await buildPlanner(majorName, year, limit);

    // ── 2. Elective groups + exclusions ────────────────────────────────────
    const roadmapGroups  = detectElectiveGroups(plannerResult.roadmap);
    const catalogGroups  = plannerResult.catalogUrl
      ? await fetchCatalogElectives(plannerResult.catalogUrl)
      : [];

    // Merge catalog groups with roadmap groups (same de-dup logic as electiveGroupsFetch)
    const roadmapOnlyGroups = roadmapGroups.filter(rg =>
      !catalogGroups.some(cg =>
        cg.options.some(co => rg.options.some(ro => ro.courseKey === co.courseKey))
      )
    );
    const electiveGroups: ElectiveGroup[] = [...catalogGroups, ...roadmapOnlyGroups];
    for (const g of electiveGroups) {
      if (chosenElectives[g.id]) g.chosen = chosenElectives[g.id];
    }

    const excludeKeys = new Set<string>();
    const selectedElectiveCourseKeys = new Set<string>();

    for (const g of electiveGroups) {
      const slotChoices = Object.entries(chosenElectives)
        .filter(([id, value]) => id.startsWith(`${g.id}__slot`) && value)
        .map(([, value]) => normalizeChosenCourseKey(value));
      const directChoice = chosenElectives[g.id] ? normalizeChosenCourseKey(chosenElectives[g.id]) : null;
      const chosenSet = new Set<string>([...(directChoice ? [directChoice] : []), ...slotChoices]);

      for (const chosen of chosenSet) selectedElectiveCourseKeys.add(chosen);

      for (const opt of g.options) {
        if (!chosenSet.has(opt.courseKey)) excludeKeys.add(opt.courseKey);
      }
    }

    // Filter nodes and inject selected elective nodes when the roadmap only had placeholders
    let filteredNodes = plannerResult.graph.nodes.filter(n => !excludeKeys.has(n.key));
    let filteredNodeKeys = new Set(filteredNodes.map(n => n.key));

    const missingSelected = [...selectedElectiveCourseKeys].filter(k => !filteredNodeKeys.has(k));
    if (missingSelected.length > 0) {
      const injected = await buildRequirementsGraph(missingSelected);
      for (const node of injected.nodes) {
        if (!filteredNodeKeys.has(node.key)) {
          filteredNodes.push(node);
          filteredNodeKeys.add(node.key);
        }
      }
      for (const edge of injected.edges) {
        plannerResult.graph.edges.push(edge);
      }
    }

    // ── 4. Prereq map (only within filtered set) ────────────────────────────
    const prereqMap = new Map<string, string[]>();
    for (const node of filteredNodes) {
      prereqMap.set(
        node.key,
        flattenPrereqs(node.prereq).filter(p => filteredNodeKeys.has(p))
      );
    }

    // CSUN-specific Computer Science sequence fixes
    if (filteredNodeKeys.has("COMP-490") && filteredNodeKeys.has("COMP-380")) {
      const curr = prereqMap.get("COMP-490") ?? [];
      if (!curr.includes("COMP-380")) prereqMap.set("COMP-490", [...curr, "COMP-380"]);
      plannerResult.graph.edges.push({ from: "COMP-380", to: "COMP-490" });
    }
    if (filteredNodeKeys.has("COMP-490L") && filteredNodeKeys.has("COMP-380")) {
      const curr = prereqMap.get("COMP-490L") ?? [];
      if (!curr.includes("COMP-380")) prereqMap.set("COMP-490L", [...curr, "COMP-380"]);
      plannerResult.graph.edges.push({ from: "COMP-380", to: "COMP-490L" });
    }
    for (const key of filteredNodeKeys) {
      if (!isUpperDivisionCompElectiveKey(key)) continue;
      if (["COMP-482", "COMP-490", "COMP-490L", "COMP-491", "COMP-491L", "COMP-492"].includes(key)) continue;
      if (!filteredNodeKeys.has("COMP-380")) continue;
      const curr = prereqMap.get(key) ?? [];
      if (!curr.includes("COMP-380")) prereqMap.set(key, [...curr, "COMP-380"]);
      plannerResult.graph.edges.push({ from: "COMP-380", to: key });
    }

    // ── 4b. Dynamic sequence inference + lab-bundle detection ───────────────────
    //
    //   For every adjacent numbered pair (gap 1 or 10) within the same subject:
    //
    //   CASE A — Lab bundle (gap=1, upper title contains "lab", OR upper is an
    //     explicit L/D-suffix key):
    //     e.g. GEOG-101 "The Physical Environment" + GEOG-102 "Physical Geography Lab"
    //     These belong IN THE SAME semester — no prereq edge. We record them in
    //     titleLabPairs so step 5 can force them to the same tier.
    //
    //   CASE B — True sequential course (gap=1, NOT a lab):
    //     e.g. COMP-490 "SR PROJECT I" + COMP-491 "SR PROJECT II"
    //     Lower is a hard prerequisite of upper → upper goes to the NEXT semester.
    //
    //   CASE C — Tens-gap (gap=10):
    //     e.g. ENGL-310 → ENGL-320 — treated as a sequential prereq.

    // titleLabPairs: labKey → lectureKey  (number-only lab pairs detected by title)
    const titleLabPairs = new Map<string, string>();

    {
      // Build title lookup for lab detection
      const titleOf = new Map<string, string>();
      for (const n of filteredNodes) titleOf.set(n.key, (n.title ?? "").toLowerCase());

      // Group by subject
      const bySubject = new Map<string, string[]>();
      for (const key of filteredNodeKeys) {
        const dash = key.indexOf("-");
        if (dash < 0) continue;
        const subj = key.slice(0, dash);
        const arr = bySubject.get(subj) ?? [];
        arr.push(key);
        bySubject.set(subj, arr);
      }

      for (const [, keys] of bySubject) {
        if (keys.length < 2) continue;

        const parsed = keys.map(key => {
          const dash = key.indexOf("-");
          const num = parseInt(key.slice(dash + 1).replace(/[A-Z]+$/i, ""), 10);
          return { key, num };
        }).filter(x => Number.isFinite(x.num));

        parsed.sort((a, b) => a.num - b.num);

        for (let i = 0; i < parsed.length - 1; i++) {
          const lower = parsed[i];
          const upper = parsed[i + 1];
          const gap = upper.num - lower.num;
          if (gap !== 1 && gap !== 10) continue;

          // Skip pairs that already have an explicit prereq relationship
          const upperPrereqs = prereqMap.get(upper.key) ?? [];
          const lowerPrereqs = prereqMap.get(lower.key) ?? [];
          if (upperPrereqs.includes(lower.key)) continue;
          if (lowerPrereqs.includes(upper.key)) continue;

          // ── Determine if this is a lab bundle ──────────────────────────────
          // Explicit lab (ends in L/D): already handled by getLectureKey, skip
          if (isLabKey(upper.key)) continue;

          // Title-based lab detection: gap=1 and upper title contains "lab"
          const upperTitle = titleOf.get(upper.key) ?? "";
          if (gap === 1 && /\blab\b/i.test(upperTitle)) {
            // CASE A: bundle — same semester, no prereq edge
            titleLabPairs.set(upper.key, lower.key);
            continue;
          }

          // ── CASE B / C: true sequential prereq ────────────────────────────
          prereqMap.set(upper.key, [...upperPrereqs, lower.key]);
          if (!plannerResult.graph.edges.some(e => e.from === lower.key && e.to === upper.key)) {
            plannerResult.graph.edges.push({ from: lower.key, to: upper.key });
          }
        }
      }
    }

    // ── 5. Force lab tiers to match their lecture (both explicit L/D and title-based)
    const minTierMap = assignMinTiers([...filteredNodeKeys], prereqMap);

    for (const key of filteredNodeKeys) {
      // Explicit lab suffix (e.g. CHEM-101L → CHEM-101)
      const explicitLectKey = getLectureKey(key);
      if (explicitLectKey && filteredNodeKeys.has(explicitLectKey)) {
        minTierMap.set(key, minTierMap.get(explicitLectKey) ?? 0);
        continue;
      }
      // Title-based lab pair (e.g. GEOG-102 "Physical Geography Lab" → GEOG-101)
      const titleLectKey = titleLabPairs.get(key);
      if (titleLectKey && filteredNodeKeys.has(titleLectKey)) {
        minTierMap.set(key, minTierMap.get(titleLectKey) ?? 0);
      }
    }

    // ── 6. Pack ─────────────────────────────────────────────────────────────
    const packable: PackableCourse[] = filteredNodes.map(n => ({
      key: n.key,
      units: n.units ?? 3,
      minTier: minTierMap.get(n.key) ?? 0,
      // Title-based lab: must co-schedule with its lecture
      bundleWith: titleLabPairs.get(n.key),
    }));
    const tierGroups = packSemesters(packable, maxUnitsPerSem);

    // ── 7. Semester metadata ────────────────────────────────────────────────
    const sortedTierIdxs = [...tierGroups.keys()].sort((a, b) => a - b);
    const semesters = sortedTierIdxs.map(ti => {
      const keys = tierGroups.get(ti)!;
      const totalUnits = keys.reduce((s, k) => {
        const n = filteredNodes.find(x => x.key === k);
        return s + (n?.units ?? 3);
      }, 0);
      return { tierIndex: ti, label: `Semester ${ti + 1}`, totalUnits, courseKeys: keys };
    });

    // ── 8. Color map (dynamic per-build) ────────────────────────────────────
    const subjects = [...new Set(filteredNodes.map(n => parseCourseKey(n.key).subject))].sort();
    const colorMap = new Map<string, string>();
    subjects.forEach((s, i) => colorMap.set(s, hashColor(s, i)));

    // ── 9. Reverse tier lookup ───────────────────────────────────────────────
    const keyTier = new Map<string, number>();
    for (const [ti, keys] of tierGroups) for (const k of keys) keyTier.set(k, ti);

    // ── 10. Output nodes ────────────────────────────────────────────────────
    const outputNodes = filteredNodes.map(n => {
      const { subject, catalog, levelBand } = parseCourseKey(n.key);
      const tierIndex = keyTier.get(n.key) ?? 0;
      return {
        key: n.key,
        title: n.title ?? null,
        units: n.units ?? null,
        subject, catalog, levelBand,
        department: subject,
        deptColor: colorMap.get(subject) ?? "#6b7280",
        tierIndex,
        semesterLabel: `Semester ${tierIndex + 1}`,
        isLab: isLabKey(n.key) || titleLabPairs.has(n.key),
      };
    });

    // ── 11. Output edges — deduplicated, only forward edges ──────────────────
    //   FIX: same from→to can appear multiple times in the raw graph if the
    //   course appears more than once in the roadmap. Deduplicate by edgeId.
    const seenEdgeIds = new Set<string>();
    const outputEdges: { from: string; to: string }[] = [];
    for (const e of plannerResult.graph.edges) {
      if (!filteredNodeKeys.has(e.from) || !filteredNodeKeys.has(e.to)) continue;
      const fromTier = keyTier.get(e.from) ?? 0;
      const toTier   = keyTier.get(e.to)   ?? 0;
      if (fromTier >= toTier) continue; // only forward (upward) edges
      const id = `${e.from}→${e.to}`;
      if (seenEdgeIds.has(id)) continue; // ← FIX for duplicate key React error
      seenEdgeIds.add(id);
      outputEdges.push(e);
    }

    // ── 12. Response ────────────────────────────────────────────────────────
    return res.json({
      majorName: plannerResult.majorName,
      catalogYear: plannerResult.year,
      matchedRoadmap: plannerResult.matchedRoadmap,
      semesters,
      nodes: outputNodes,
      edges: outputEdges,
      electiveOptions: buildElectiveOptions(electiveGroups, chosenElectives, new Set(filteredNodes.map(n => n.key))),
      electiveGroups,
      paceInfo: { pace, maxUnitsPerSem, minUnitsPerSem },
      debug: {
        totalCoursesBeforeFilter: plannerResult.graph.nodes.length,
        totalCoursesAfterFilter:  filteredNodes.length,
        excludedCourses:    [...excludeKeys],
        subjectColors:      Object.fromEntries(colorMap),
        semesterBreakdown:  semesters.map(s => ({
          semester: s.label, units: s.totalUnits, courses: s.courseKeys,
        })),
        prereqMap:     Object.fromEntries(prereqMap),
        minTierMap:    Object.fromEntries(minTierMap),
        electiveGroups,
      },
    });
  } catch (e: any) {
    console.error("skillTreeBuild:", e);
    return res.status(500).json({ error: e?.message || "Failed to build skill tree" });
  }
}
