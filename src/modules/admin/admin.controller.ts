import { Request, Response } from "express";
import { logAdminAction } from "@/utils/audit";
import * as adminService from "./admin.service";
import prisma from "@/utils/prisma";

export const getAdminProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { permissions, scopes, roles } = await adminService.getPermissionsForUser(req.user!.id);
    res.json({
      user: { id: req.user!.id, email: req.user!.email, firstName: req.user!.firstName, lastName: req.user!.lastName, profilePicture: req.user!.profilePicture },
      roles: roles.map((r) => ({ id: r.role.id, name: r.role.name, departmentScope: r.departmentScope })),
      permissions,
      departmentScopes: scopes,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch admin profile" });
  }
};

export const listRoles = async (req: Request, res: Response): Promise<void> => {
  try {
    const roles = await adminService.getAllRoles();
    res.json(roles.map((r) => ({
      id: r.id, name: r.name, description: r.description, isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permission), userCount: r._count.users, createdAt: r.createdAt,
    })));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch roles" });
  }
};

export const createRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, permissions } = req.body;
    if (!name || !permissions || !Array.isArray(permissions)) {
      res.status(400).json({ error: "name and permissions[] required" });
      return;
    }

    const existing = await adminService.findRoleByName(name);
    if (existing) { res.status(409).json({ error: "Role name already exists" }); return; }

    const role = await adminService.createNewRole(name, description || null, permissions);
    await logAdminAction(req, "role:created", `role:${role.id}`, { name, permissions });
    res.status(201).json({ id: role.id, name: role.name, description: role.description, isSystem: role.isSystem, permissions: role.permissions.map((p) => p.permission) });
  } catch (error) {
    res.status(500).json({ error: "Failed to create role" });
  }
};

export const updateRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { name, description, permissions } = req.body;
    const role = await adminService.findRoleById(id);
    if (!role) { res.status(404).json({ error: "Role not found" }); return; }
    if (role.isSystem) { res.status(403).json({ error: "Cannot modify system roles" }); return; }

    const updated = await adminService.updateExistingRole(id, name, description, permissions);
    await logAdminAction(req, "role:updated", `role:${id}`, { name, permissions });
    res.json({ id: updated!.id, name: updated!.name, description: updated!.description, isSystem: updated!.isSystem, permissions: updated!.permissions.map((p) => p.permission) });
  } catch (error) {
    res.status(500).json({ error: "Failed to update role" });
  }
};

export const deleteRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const role = await adminService.findRoleById(id);
    if (!role) { res.status(404).json({ error: "Role not found" }); return; }
    if (role.isSystem) { res.status(403).json({ error: "Cannot delete system roles" }); return; }

    await adminService.deleteRoleById(id);
    await logAdminAction(req, "role:deleted", `role:${id}`, { name: role.name });
    res.json({ message: "Role deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete role" });
  }
};

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || "";
    const { users, total } = await adminService.getUsers(search, page, limit);

    res.json({
      users: users.map((u) => ({ ...u, roles: u.roles.map((r) => ({ id: r.role.id, name: r.role.name, departmentScope: r.departmentScope })) })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

export const getUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const user = await adminService.getUserById(id);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    res.json({ ...user, roles: user.roles.map((r) => ({ id: r.role.id, name: r.role.name, departmentScope: r.departmentScope, grantedAt: r.grantedAt, expiresAt: r.expiresAt })) });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

export const assignRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { roleId, departmentScope, expiresAt } = req.body;
    if (!roleId) { res.status(400).json({ error: "roleId required" }); return; }

    const [user, role] = await Promise.all([adminService.findUser(id), adminService.findRole(roleId)]);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (!role) { res.status(404).json({ error: "Role not found" }); return; }

    const existing = await adminService.findUserRole(id, roleId, departmentScope);
    if (existing) { res.status(409).json({ error: "User already has this role" }); return; }

    await adminService.assignRoleToUser(id, roleId, req.user!.id, departmentScope, expiresAt);
    await logAdminAction(req, "role:assigned", `user:${id}`, { roleId, roleName: role.name, departmentScope });
    await adminService.createNotification(id, "roleAssigned", "Admin role assigned", `You have been assigned the ${role.name} role`, { roleId, roleName: role.name });
    res.status(201).json({ message: `Role ${role.name} assigned` });
  } catch (error) {
    res.status(500).json({ error: "Failed to assign role" });
  }
};

export const revokeRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const roleId = req.params.roleId as string;
    const userRole = await adminService.findUserRoleWithName(id, roleId);
    if (!userRole) { res.status(404).json({ error: "User does not have this role" }); return; }

    await adminService.revokeUserRole(userRole.id);
    await logAdminAction(req, "role:revoked", `user:${id}`, { roleId, roleName: userRole.role.name });
    await adminService.createNotification(id, "roleRevoked", "Admin role revoked", `Your ${userRole.role.name} role has been removed`, { roleId, roleName: userRole.role.name });
    res.json({ message: `Role ${userRole.role.name} revoked` });
  } catch (error) {
    res.status(500).json({ error: "Failed to revoke role" });
  }
};

export const suspendUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { reason, duration } = req.body;
    if (!reason) { res.status(400).json({ error: "reason required" }); return; }
    if (id === req.user!.id) { res.status(400).json({ error: "Cannot suspend yourself" }); return; }

    const user = await adminService.findUser(id);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    await adminService.createSuspension(id, req.user!.id, reason, duration);
    await logAdminAction(req, "user:suspended", `user:${id}`, { reason, duration });
    await adminService.createNotification(id, "accountSuspended", "Account suspended", reason);
    res.json({ message: "User suspended" });
  } catch (error) {
    res.status(500).json({ error: "Failed to suspend user" });
  }
};

export const unsuspendUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await adminService.liftSuspension(id);
    await logAdminAction(req, "user:unsuspended", `user:${id}`);
    res.json({ message: "User unsuspended" });
  } catch (error) {
    res.status(500).json({ error: "Failed to unsuspend user" });
  }
};

export const getAuditLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const action = req.query.action as string;
    const { logs, total } = await adminService.getAuditLogs(action, page, limit);
    res.json({ logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
};

export const getAnalyticsOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await adminService.getAnalytics();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

export const getBugReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const bugs = await prisma.bugReport.findMany({
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(bugs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bug reports" });
  }
};

export const updateBugReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { reportStatus, assignedToId } = req.body;

    const bug = await prisma.bugReport.findUnique({ where: { id } });
    if (!bug) { res.status(404).json({ error: "Bug report not found" }); return; }

    const updateData: any = {};
    if (reportStatus) updateData.reportStatus = reportStatus;
    if (assignedToId !== undefined) updateData.assignedToId = assignedToId || null;

    const updated = await prisma.bugReport.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await logAdminAction(req, "bug:updated", `bug:${id}`, { reportStatus, assignedToId });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update bug report" });
  }
};

export const getAdminClubs = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || "";
    const { clubs, total } = await adminService.getClubs(search, page, limit);
    res.json({ clubs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch clubs" });
  }
};

export const approveClub = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const club = await prisma.club.findUnique({ where: { id }, select: { id: true, name: true, createdById: true } });
    if (!club) { res.status(404).json({ error: "Club not found" }); return; }

    await prisma.club.update({ where: { id }, data: { status: "approved" } });

    await prisma.notification.create({
      data: {
        userId: club.createdById,
        type: "clubAnnouncement",
        title: "Club approved",
        body: `Your club "${club.name}" has been approved and is now live.`,
        data: { clubId: id, action: "approved" },
      },
    });

    await logAdminAction(req, "club:approved", `club:${id}`, { name: club.name });
    res.json({ message: "Club approved" });
  } catch (error) {
    res.status(500).json({ error: "Failed to approve club" });
  }
};

export const rejectClub = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { reason } = req.body;
    const club = await prisma.club.findUnique({ where: { id }, select: { id: true, name: true, createdById: true } });
    if (!club) { res.status(404).json({ error: "Club not found" }); return; }

    await prisma.club.update({ where: { id }, data: { status: "rejected", rejectionReason: reason || null } });

    await prisma.notification.create({
      data: {
        userId: club.createdById,
        type: "clubAnnouncement",
        title: "Club rejected",
        body: reason || `Your club "${club.name}" was not approved.`,
        data: { clubId: id, action: "rejected" },
      },
    });

    await logAdminAction(req, "club:rejected", `club:${id}`, { name: club.name, reason });
    res.json({ message: "Club rejected" });
  } catch (error) {
    res.status(500).json({ error: "Failed to reject club" });
  }
};

export const deleteAdminClub = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const club = await adminService.findClub(id);
    if (!club) { res.status(404).json({ error: "Club not found" }); return; }
    await adminService.deleteClub(id);
    await logAdminAction(req, "club:deleted", `club:${id}`, { name: club.name });
    res.json({ message: "Club deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete club" });
  }
};

export const getAdminListings = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || "";
    const status = req.query.status as string;
    const { listings, total } = await adminService.getListings(search, status, page, limit);
    res.json({ listings, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch listings" });
  }
};

export const removeAdminListing = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { reason } = req.body;
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      select: { id: true, title: true, sellerId: true },
    });
    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    await prisma.marketplaceListing.update({ where: { id }, data: { status: "deleted" } });

    await prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: "marketplaceUpdate",
        title: "Listing removed",
        body: reason || `Your listing "${listing.title}" has been removed for violating platform guidelines.`,
        data: { listingId: id, action: "removed" },
      },
    });

    await logAdminAction(req, "listing:removed", `listing:${id}`, { title: listing.title, reason });
    res.json({ message: "Listing removed and seller notified" });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove listing" });
  }
};

export const getAdminEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || "";
    const { events, total } = await adminService.getEvents(search, page, limit);
    res.json({ events, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
};

export const deleteAdminEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { reason } = req.body;
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, title: true, createdById: true },
    });
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    if (event.createdById) {
      await prisma.notification.create({
        data: {
          userId: event.createdById,
          type: "clubAnnouncement",
          title: "Event removed",
          body: reason || `Your event "${event.title}" has been removed for violating platform guidelines.`,
          data: { eventId: id, action: "removed" },
        },
      });
    }

    await prisma.event.delete({ where: { id } });
    await logAdminAction(req, "event:deleted", `event:${id}`, { title: event.title, reason });
    res.json({ message: "Event removed and creator notified" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete event" });
  }
};

export const getSystemConfigs = async (req: Request, res: Response): Promise<void> => {
  try { res.json(await adminService.getConfigs()); } catch (error) { res.status(500).json({ error: "Failed to fetch configs" }); }
};

export const upsertSystemConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { key, value } = req.body;
    if (!key) { res.status(400).json({ error: "key required" }); return; }
    const config = await adminService.setConfig(key, value, req.user!.id);
    await logAdminAction(req, "config:updated", `config:${key}`, { value });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: "Failed to update config" });
  }
};

export const getAnnouncements = async (req: Request, res: Response): Promise<void> => {
  try { res.json(await adminService.getAllAnnouncements()); } catch (error) { res.status(500).json({ error: "Failed to fetch announcements" }); }
};

export const createAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, body } = req.body;
    if (!title || !body) { res.status(400).json({ error: "title and body required" }); return; }
    const announcement = await adminService.createNewAnnouncement(req.body, req.user!.id);
    await logAdminAction(req, "announcement:created", `announcement:${announcement.id}`, { title });
    res.status(201).json(announcement);
  } catch (error) {
    res.status(500).json({ error: "Failed to create announcement" });
  }
};

export const deleteAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await adminService.deleteAnnouncementById(id);
    await logAdminAction(req, "announcement:deleted", `announcement:${id}`);
    res.json({ message: "Announcement deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete announcement" });
  }
};

export const delistAdminEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { reason } = req.body;
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, title: true, createdById: true },
    });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    await prisma.event.update({ where: { id }, data: { isPublic: false } });

    if (event.createdById) {
      await prisma.notification.create({
        data: {
          userId: event.createdById,
          type: "clubAnnouncement",
          title: "Event delisted",
          body: reason || `Your event "${event.title}" has been delisted by an admin. Please review and republish.`,
          data: { eventId: id, action: "delisted" },
        },
      });
    }

    await logAdminAction(req, "event:delisted", `event:${id}`, { title: event.title, reason });
    res.json({ message: "Event delisted and creator notified" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delist event" });
  }
};

export const delistAdminListing = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { reason } = req.body;
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      select: { id: true, title: true, sellerId: true },
    });
    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    await prisma.marketplaceListing.update({ where: { id }, data: { status: "inactive" } });

    await prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: "marketplaceUpdate",
        title: "Listing delisted",
        body: reason || `Your listing "${listing.title}" has been delisted by an admin. Please review and relist.`,
        data: { listingId: id, action: "delisted" },
      },
    });

    await logAdminAction(req, "listing:delisted", `listing:${id}`, { title: listing.title, reason });
    res.json({ message: "Listing delisted and seller notified" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delist listing" });
  }
};

