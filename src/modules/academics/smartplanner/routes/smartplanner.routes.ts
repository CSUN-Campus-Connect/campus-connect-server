import { Router } from "express";
import {
  catalogYears,
  electiveGroupsFetch,
  majorsSearch,
  plannerBuild,
  requirementsGraph,
  roadmapsDepartment,
  roadmapsDepartments,
  roadmapsParse,
  roadmapsSuggest,
  skillTreeBuild
} from "../controllers/smartplanner.controller";

export function smartPlannerRoutes() {
  const r = Router();

  // Major search - handle both paths
  r.get("/majors", majorsSearch);
  r.get("/majors/search", majorsSearch);

  r.get("/catalog-years", catalogYears);

  r.get("/roadmaps/departments", roadmapsDepartments);
  r.get("/roadmaps/department/:slug", roadmapsDepartment);
  r.get("/roadmaps/parse", roadmapsParse);
  r.get("/roadmaps/suggest", roadmapsSuggest);

  r.post("/requirements/graph", requirementsGraph);

  // Planner endpoints
  r.post("/planner/build", plannerBuild);
  r.post("/planner/elective-groups", electiveGroupsFetch); // Step 1: fetch elective choices
  r.post("/planner/skill-tree", skillTreeBuild);           // Step 2: build full tree

  return r;
}
