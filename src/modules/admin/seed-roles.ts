import prisma from "@/utils/prisma";

const ROLES = [
  {
    name: "Platform Admin",
    description: "Full system access across all modules",
    isSystem: true,
    permissions: [
      "users:read", "users:edit", "users:suspend", "users:ban", "users:delete", "users:view_sessions",
      "roles:read", "roles:create", "roles:edit", "roles:delete", "roles:assign",
      "moderation:read", "moderation:review", "moderation:action", "moderation:escalate",
      "clubs:read", "clubs:approve", "clubs:edit", "clubs:delete", "clubs:manage_leaders",
      "marketplace:read", "marketplace:moderate",
      "events:read", "events:edit", "events:feature",
      "security:view_cases", "security:investigate", "security:assign", "security:close",
      "security:manage_dept", "security:cross_dept", "security:clery", "security:broadcast",
      "analytics:view", "analytics:export",
      "bugs:read", "bugs:manage",
      "system:config", "system:announcements", "system:audit_log", "system:maintenance",
    ],
  },
  {
    name: "Content Moderator",
    description: "Review and act on content reports, manage user violations",
    isSystem: true,
    permissions: [
      "users:read", "users:suspend",
      "moderation:read", "moderation:review", "moderation:action", "moderation:escalate",
      "marketplace:read", "marketplace:moderate",
      "clubs:read",
    ],
  },
  {
    name: "Club Administrator",
    description: "Approve and manage clubs and club events",
    isSystem: true,
    permissions: [
      "clubs:read", "clubs:approve", "clubs:edit", "clubs:delete", "clubs:manage_leaders",
      "events:read", "events:edit",
    ],
  },
  {
    name: "Security Investigator",
    description: "View and manage assigned security cases",
    isSystem: true,
    permissions: [
      "security:view_cases", "security:investigate",
    ],
  },
  {
    name: "Security Department Head",
    description: "Manage department security cases, assign investigators",
    isSystem: true,
    permissions: [
      "security:view_cases", "security:investigate", "security:assign", "security:close", "security:manage_dept",
    ],
  },
  {
    name: "Security Executive",
    description: "Cross-department security oversight and Clery compliance",
    isSystem: true,
    permissions: [
      "security:view_cases", "security:cross_dept", "security:clery",
      "analytics:view",
    ],
  },
  {
    name: "Executive Viewer",
    description: "Read-only access to analytics and platform overview",
    isSystem: true,
    permissions: [
      "users:read",
      "analytics:view",
    ],
  },
  {
    name: "Bug Triager",
    description: "Review and manage bug reports",
    isSystem: true,
    permissions: [
      "bugs:read", "bugs:manage",
    ],
  },
];

export const seedRoles = async () => {
  console.log("Seeding roles and permissions...");

  for (const roleDef of ROLES) {
    const existing = await prisma.role.findUnique({ where: { name: roleDef.name } });

    if (existing) {
      console.log(`  Role "${roleDef.name}" already exists, skipping`);
      continue;
    }

    await prisma.role.create({
      data: {
        name: roleDef.name,
        description: roleDef.description,
        isSystem: roleDef.isSystem,
        permissions: {
          create: roleDef.permissions.map((p) => ({ permission: p })),
        },
      },
    });

    console.log(`  Created role "${roleDef.name}" with ${roleDef.permissions.length} permissions`);
  }

  console.log("Role seeding complete.");
};

export const assignPlatformAdmin = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User with email ${email} not found`);
    return;
  }

  const role = await prisma.role.findUnique({ where: { name: "Platform Admin" } });
  if (!role) {
    console.error("Platform Admin role not found. Run seedRoles first.");
    return;
  }

  const existing = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: role.id },
  });

  if (existing) {
    console.log(`${email} is already a Platform Admin`);
    return;
  }

  await prisma.userRole.create({
    data: {
      userId: user.id,
      roleId: role.id,
    },
  });

  console.log(`Assigned Platform Admin role to ${email}`);
};

if (require.main === module) {
  const args = process.argv.slice(2);

  const run = async () => {
    await seedRoles();

    if (args[0] === "--assign" && args[1]) {
      await assignPlatformAdmin(args[1]);
    }

    await prisma.$disconnect();
  };

  run().catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
}