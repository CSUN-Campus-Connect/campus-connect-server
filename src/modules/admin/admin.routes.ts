import { Router } from "express";
import { authenticateToken } from "@/middleware/auth.middleware";
import { requireAdmin, requirePermission } from "@/middleware/permission.middleware";
import * as adminController from "./admin.controller";

const router = Router();

// All admin routes require authentication + at least one admin role
router.use(authenticateToken, requireAdmin);

// Auth Check
// GET /api/v1/admin/me - Get current user's admin profile with permissions
router.get("/me", adminController.getAdminProfile);

// Role management
// GET /api/v1/admin/roles - List all roles
router.get("/roles", requirePermission("roles:read"), adminController.listRoles);

// Create a new role
router.post("/roles", requirePermission("roles:create"), adminController.createRole);

// PATCH /api/v1/admin/roles/:id - Update a role
router.patch("/roles/:id", requirePermission("roles:edit"), adminController.updateRole);

// DELETE /api/v1/admin/roles/:id - Delete a non-system role
router.delete("/roles/:id", requirePermission("roles:delete"), adminController.deleteRole);

// --- User role assignment ---
// GET /api/v1/admin/users - List users with their roles (paginated)
router.get("/users", requirePermission("users:read"), adminController.listUsers);

// GET /api/v1/admin/users/:id - Get user detail with roles
router.get("/users/:id", requirePermission("users:read"), adminController.getUser);

// POST /api/v1/admin/users/:id/roles - Assign a role to a user
router.post("/users/:id/roles", requirePermission("roles:assign"), adminController.assignRole);

// DELETE /api/v1/admin/users/:id/roles/:roleId - Revoke a role from a user
router.delete("/users/:id/roles/:roleId", requirePermission("roles:assign"), adminController.revokeRole);

// --- User actions ---
// PATCH /api/v1/admin/users/:id/suspend - Suspend a user
router.patch("/users/:id/suspend", requirePermission("users:suspend"), adminController.suspendUser);

// PATCH /api/v1/admin/users/:id/unsuspend - Unsuspend a user
router.patch("/users/:id/unsuspend", requirePermission("users:suspend"), adminController.unsuspendUser);

// --- Audit log ---
// GET /api/v1/admin/audit-log - View audit log
router.get("/audit-log", requirePermission("system:audit_log"), adminController.getAuditLog);

// --- Analytics ---
// GET /api/v1/admin/analytics/overview - Platform overview stats
router.get("/analytics/overview", requirePermission("analytics:view"), adminController.getAnalyticsOverview);

// Clubs 
router.get("/clubs", requirePermission("clubs:read"), adminController.getAdminClubs);
router.delete("/clubs/:id", requirePermission("clubs:delete"), adminController.deleteAdminClub);
router.patch("/clubs/:id/approve", requirePermission("clubs:approve"), adminController.approveClub);
router.patch("/clubs/:id/reject", requirePermission("clubs:approve"), adminController.rejectClub);

// Marketplace 
router.get("/marketplace", requirePermission("marketplace:read"), adminController.getAdminListings);
router.delete("/marketplace/:id", requirePermission("marketplace:moderate"), adminController.removeAdminListing);
router.patch("/marketplace/:id/delist", requirePermission("marketplace:moderate"), adminController.delistAdminListing);

// Events 
router.get("/events", requirePermission("events:read"), adminController.getAdminEvents);
router.delete("/events/:id", requirePermission("events:edit"), adminController.deleteAdminEvent);
router.patch("/events/:id/delist", requirePermission("events:edit"), adminController.delistAdminEvent);

// Settings 
router.get("/config", requirePermission("system:config"), adminController.getSystemConfigs);
router.post("/config", requirePermission("system:config"), adminController.upsertSystemConfig);

// Bug Reports
router.get("/bugs", requirePermission("bugs:read"), adminController.getBugReports);
router.patch("/bugs/:id", requirePermission("bugs:manage"), adminController.updateBugReport);

export default router;