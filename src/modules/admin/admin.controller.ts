import { Request, Response } from "express";
import prisma from "@/utils/prisma";
import { getUserPermissions, getUserDepartmentScopes } from "@/middleware/permission.middleware";
import { logAdminAction } from "@/utils/audit";

export const getAdminProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const permissions = await getUserPermissions(req.user!.id);
    const scopes = await getUserDepartmentScopes(req.user!.id);

    const roles = await prisma.userRole.findMany({
      where: { userId: req.user!.id },
      include: { role: { select: { id: true, name: true } } },
    });

    res.json({
      user: {
        id: req.user!.id,
        email: req.user!.email,
        firstName: req.user!.firstName,
        lastName: req.user!.lastName,
        profilePicture: req.user!.profilePicture,
      },
      roles: roles.map((r) => ({
        id: r.role.id,
        name: r.role.name,
        departmentScope: r.departmentScope,
      })),
      permissions,
      departmentScopes: scopes,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch admin profile" });
  }
};

export const listRoles = async (req: Request, res: Response): Promise<void> => {
  try {
    const roles = await prisma.role.findMany({
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: "asc" },
    });

    res.json(
      roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        permissions: r.permissions.map((p) => p.permission),
        userCount: r._count.users,
        createdAt: r.createdAt,
      })),
    );
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

    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) {
      res.status(409).json({ error: "Role name already exists" });
      return;
    }

    const role = await prisma.role.create({
      data: {
        name,
        description: description || null,
        permissions: {
          create: permissions.map((p: string) => ({ permission: p })),
        },
      },
      include: { permissions: { select: { permission: true } } },
    });

    await logAdminAction(req, "role:created", `role:${role.id}`, { name, permissions });

    res.status(201).json({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map((p) => p.permission),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create role" });
  }
};

export const updateRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { name, description, permissions } = req.body;

    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      res.status(404).json({ error: "Role not found" });
      return;
    }

    if (role.isSystem) {
      res.status(403).json({ error: "Cannot modify system roles" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (permissions && Array.isArray(permissions)) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: permissions.map((p: string) => ({ roleId: id, permission: p })),
        });
      }

      await tx.role.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
        },
      });
    });

    await logAdminAction(req, "role:updated", `role:${id}`, { name, permissions });

    const updated = await prisma.role.findUnique({
      where: { id },
      include: { permissions: { select: { permission: true } } },
    });

    res.json({
      id: updated!.id,
      name: updated!.name,
      description: updated!.description,
      isSystem: updated!.isSystem,
      permissions: updated!.permissions.map((p) => p.permission),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update role" });
  }
};

export const deleteRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      res.status(404).json({ error: "Role not found" });
      return;
    }

    if (role.isSystem) {
      res.status(403).json({ error: "Cannot delete system roles" });
      return;
    }

    await prisma.role.delete({ where: { id } });
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
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          userType: true,
          isVerified: true,
          profilePicture: true,
          createdAt: true,
          lastActiveAt: true,
          roles: {
            include: { role: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users: users.map((u) => ({
        ...u,
        roles: u.roles.map((r) => ({
          id: r.role.id,
          name: r.role.name,
          departmentScope: r.departmentScope,
        })),
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

export const getUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userType: true,
        isVerified: true,
        profilePicture: true,
        bio: true,
        city: true,
        createdAt: true,
        lastActiveAt: true,
        roles: {
          include: {
            role: { select: { id: true, name: true } },
          },
        },
        student: true,
        faculty: true,
        alumni: true,
        _count: {
          select: {
            Post: true,
            clubMemberships: true,
            marketplaceListings: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const violations = await prisma.userViolation.findMany({
      where: { userId: id, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      ...user,
      roles: user.roles.map((r) => ({
        id: r.role.id,
        name: r.role.name,
        departmentScope: r.departmentScope,
        grantedAt: r.grantedAt,
        expiresAt: r.expiresAt,
      })),
      violations,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

export const assignRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { roleId, departmentScope, expiresAt } = req.body;

    if (!roleId) {
      res.status(400).json({ error: "roleId required" });
      return;
    }

    const [user, role] = await Promise.all([
      prisma.user.findUnique({ where: { id }, select: { id: true, email: true } }),
      prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } }),
    ]);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (!role) {
      res.status(404).json({ error: "Role not found" });
      return;
    }

    const existing = await prisma.userRole.findFirst({
      where: { userId: id, roleId, departmentScope: departmentScope || null },
    });
    if (existing) {
      res.status(409).json({ error: "User already has this role" });
      return;
    }

    await prisma.userRole.create({
      data: {
        userId: id,
        roleId,
        departmentScope: departmentScope || null,
        grantedById: req.user!.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    await logAdminAction(req, "role:assigned", `user:${id}`, {
      roleId,
      roleName: role.name,
      departmentScope,
    });

    await prisma.notification.create({
      data: {
        userId: id,
        type: "roleAssigned",
        title: "Admin role assigned",
        body: `You have been assigned the ${role.name} role`,
        data: { roleId, roleName: role.name },
      },
    });

    res.status(201).json({ message: `Role ${role.name} assigned` });
  } catch (error) {
    res.status(500).json({ error: "Failed to assign role" });
  }
};

export const revokeRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const roleId = req.params.roleId as string;

    const userRole = await prisma.userRole.findFirst({
      where: { userId: id, roleId },
      include: { role: { select: { name: true } } },
    });

    if (!userRole) {
      res.status(404).json({ error: "User does not have this role" });
      return;
    }

    await prisma.userRole.delete({ where: { id: userRole.id } });

    await logAdminAction(req, "role:revoked", `user:${id}`, {
      roleId,
      roleName: userRole.role.name,
    });

    await prisma.notification.create({
      data: {
        userId: id,
        type: "roleRevoked",
        title: "Admin role revoked",
        body: `Your ${userRole.role.name} role has been removed`,
        data: { roleId, roleName: userRole.role.name },
      },
    });

    res.json({ message: `Role ${userRole.role.name} revoked` });
  } catch (error) {
    res.status(500).json({ error: "Failed to revoke role" });
  }
};

export const suspendUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const { reason, duration } = req.body;

    if (!reason) {
      res.status(400).json({ error: "reason required" });
      return;
    }

    if (id === req.user!.id) {
      res.status(400).json({ error: "Cannot suspend yourself" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const expiresAt = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;

    await prisma.userViolation.create({
      data: {
        userId: id,
        type: expiresAt ? "TEMPORARY_SUSPENSION" : "PERMANENT_BAN",
        reason,
        issuedById: req.user!.id,
        expiresAt,
      },
    });

    await logAdminAction(req, "user:suspended", `user:${id}`, { reason, duration });

    await prisma.notification.create({
      data: {
        userId: id,
        type: "accountSuspended",
        title: "Account suspended",
        body: reason,
      },
    });

    res.json({ message: "User suspended" });
  } catch (error) {
    res.status(500).json({ error: "Failed to suspend user" });
  }
};

export const unsuspendUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    await prisma.userViolation.updateMany({
      where: { userId: id, isActive: true },
      data: { isActive: false },
    });

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
    const skip = (page - 1) * limit;

    const where = action ? { action: { contains: action } } : {};

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        include: {
          actor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
};

export const getAnalyticsOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersMonth,
      newUsersWeek,
      totalPosts,
      totalClubs,
      totalListings,
      activeListings,
      totalEvents,
      usersByType,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.post.count(),
      prisma.club.count(),
      prisma.marketplaceListing.count(),
      prisma.marketplaceListing.count({ where: { status: "active" } }),
      prisma.event.count(),
      prisma.user.groupBy({ by: ["userType"], _count: true }),
    ]);

    res.json({
      users: {
        total: totalUsers,
        newThisMonth: newUsersMonth,
        newThisWeek: newUsersWeek,
        byType: Object.fromEntries(usersByType.map((u) => [u.userType, u._count])),
      },
      content: {
        posts: totalPosts,
        clubs: totalClubs,
        events: totalEvents,
      },
      marketplace: {
        totalListings,
        activeListings,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

export const getBugReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const bugs = await prisma.bugReport.findMany({
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(bugs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bug reports" });
  }
};

export const getAdminClubs = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;
 
    const where = search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : {};
 
    const [clubs, total] = await Promise.all([
      prisma.club.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { members: true, events: true, joinRequests: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.club.count({ where }),
    ]);
 
    res.json({
      clubs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch clubs" });
  }
};
 
export const deleteAdminClub = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const club = await prisma.club.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!club) {
      res.status(404).json({ error: "Club not found" });
      return;
    }
 
    await prisma.club.delete({ where: { id } });
    await logAdminAction(req, "club:deleted", `club:${id}`, { name: club.name });
    res.json({ message: "Club deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete club" });
  }
};
 
// MARKETPLACE ADMIN
 
export const getAdminListings = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;
 
    const where: any = {};
    if (status) where.status = status;
    if (search) where.title = { contains: search, mode: "insensitive" };
 
    const [listings, total] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where,
        include: {
          seller: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.marketplaceListing.count({ where }),
    ]);
 
    res.json({
      listings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch listings" });
  }
};
 
export const removeAdminListing = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const listing = await prisma.marketplaceListing.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
 
    await prisma.marketplaceListing.update({ where: { id }, data: { status: "deleted" } });
    await logAdminAction(req, "listing:removed", `listing:${id}`, { title: listing.title });
    res.json({ message: "Listing removed" });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove listing" });
  }
};
 
// EVENTS ADMIN
 
export const getAdminEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;
 
    const where = search
      ? { title: { contains: search, mode: "insensitive" as const } }
      : {};
 
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          club: { select: { id: true, name: true } },
        },
        orderBy: { startDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.event.count({ where }),
    ]);
 
    res.json({
      events,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
};
 
export const deleteAdminEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const event = await prisma.event.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
 
    await prisma.event.delete({ where: { id } });
    await logAdminAction(req, "event:deleted", `event:${id}`, { title: event.title });
    res.json({ message: "Event deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete event" });
  }
};

// SETTINGS / SYSTEM CONFIG
 
export const getSystemConfigs = async (req: Request, res: Response): Promise<void> => {
  try {
    const configs = await prisma.systemConfig.findMany({ orderBy: { key: "asc" } });
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch configs" });
  }
};
 
export const upsertSystemConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { key, value } = req.body;
    if (!key) {
      res.status(400).json({ error: "key required" });
      return;
    }
 
    const config = await prisma.systemConfig.upsert({
      where: { key },
      update: { value, updatedBy: req.user!.id },
      create: { key, value, updatedBy: req.user!.id },
    });
 
    await logAdminAction(req, "config:updated", `config:${key}`, { value });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: "Failed to update config" });
  }
};
 
export const getAnnouncements = async (req: Request, res: Response): Promise<void> => {
  try {
    const announcements = await prisma.announcement.findMany({
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(announcements);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch announcements" });
  }
};
 
export const createAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, body, type, audience, endsAt } = req.body;
    if (!title || !body) {
      res.status(400).json({ error: "title and body required" });
      return;
    }
 
    const announcement = await prisma.announcement.create({
      data: {
        title,
        body,
        type: type || "INFO",
        audience: audience || "ALL",
        endsAt: endsAt ? new Date(endsAt) : null,
        authorId: req.user!.id,
      },
    });
 
    await logAdminAction(req, "announcement:created", `announcement:${announcement.id}`, { title });
    res.status(201).json(announcement);
  } catch (error) {
    res.status(500).json({ error: "Failed to create announcement" });
  }
};
 
export const deleteAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await prisma.announcement.delete({ where: { id } });
    await logAdminAction(req, "announcement:deleted", `announcement:${id}`);
    res.json({ message: "Announcement deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete announcement" });
  }
};