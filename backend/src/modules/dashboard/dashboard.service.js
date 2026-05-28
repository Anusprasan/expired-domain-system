import ActivityLog from "../activity-logs/activityLog.model.js";
import Brand from "../brands/brand.model.js";
import DevelopmentDomain from "../development/developmentDomain.model.js";
import Group from "../groups/group.model.js";
import MoneySite from "../money-sites/moneySite.model.js";
import PasswordResetRequest from "../password-reset/passwordReset.model.js";
import User from "../users/user.model.js";

const MONEY_SITE_PRIVILEGES = [
  "VIEW_MONEY_SITES",
  "CREATE_MONEY_SITES",
  "EDIT_MONEY_SITES",
  "DELETE_MONEY_SITES",
];

const DEVELOPMENT_PRIVILEGES = [
  "CREATE_DOMAINS",
  "EDIT_DOMAINS",
  "DELETE_DOMAINS",
  "ASSIGN_DEVELOPMENT",
  "DO_DEVELOPMENT",
  "VIEW_DEVELOPMENT_PROGRESS",
  "ADD_TEMPLATES",
  "ADD_CONTENT",
  "EDIT_CONTENT",
];

const DASHBOARD_ACTIONS = [
  {
    id: "manage-users",
    label: "Manage Users",
    description: "Create accounts, update assignments, and control account status.",
    path: "/users",
    requiredAnyPrivileges: ["CREATE_USERS", "EDIT_USERS", "DELETE_USERS"],
  },
  {
    id: "manage-groups",
    label: "Manage Groups",
    description: "Maintain protected groups and role-based access.",
    path: "/groups",
    requiredAnyPrivileges: ["CREATE_GROUPS", "EDIT_GROUPS", "DELETE_GROUPS"],
  },
  {
    id: "manage-brands",
    label: "Manage Brands",
    description: "Review and maintain tracked brand records.",
    path: "/brands",
    requiredAnyPrivileges: ["CREATE_BRANDS", "EDIT_BRANDS", "DELETE_BRANDS"],
  },
  {
    id: "money-sites",
    label: "Money Site Checker",
    description: "Track money-site status, blocked alerts, and cleanup actions.",
    path: "/money-sites",
    requiredAnyPrivileges: MONEY_SITE_PRIVILEGES,
  },
  {
    id: "lp-servers",
    label: "Manage LP Servers",
    description: "Manage hosting details, servers, and configurations.",
    path: "/lp-servers",
    requiredAnyPrivileges: [
      "VIEW_LP_SERVERS_DETAILS",
      "CREATE_LP_SERVERS_DETAILS",
      "EDIT_LP_SERVERS_DETAILS",
      "DELETE_LP_SERVERS_DETAILS",
      "IMPORT_LP_SERVERS_DETAILS",
      "EXPORT_LP_SERVERS_DETAILS",
    ],
  },
  {
    id: "development-board",
    label: "Development Board",
    description: "Track domain progress, assignments, and delivery state.",
    path: "/development",
    requiredAnyPrivileges: [
      "CREATE_DOMAINS",
      "EDIT_DOMAINS",
      "DELETE_DOMAINS",
      "ASSIGN_DEVELOPMENT",
      "DO_DEVELOPMENT",
      "VIEW_DEVELOPMENT_PROGRESS",
      "ADD_TEMPLATES",
      "ADD_CONTENT",
      "EDIT_CONTENT",
    ],
  },
  {
    id: "audit-logs",
    label: "Review Activity Logs",
    description: "Inspect the most recent actions across the workspace.",
    path: "/activity-logs",
    requiredAnyPrivileges: ["VIEW_SYSTEM_AUDIT_LOGS", "VIEW_OWN_AUDIT_LOGS"],
  },
  {
    id: "profile",
    label: "My Profile",
    description: "Update personal information and security settings.",
    path: "/my-profile",
  },
];

function getPrivilegeKeys(user) {
  return user?.groupId?.privilegeIds?.map((privilege) => privilege.key) || [];
}

function hasAdminAccess(user) {
  const groupName = user?.groupId?.name?.toLowerCase();
  return groupName === "admin" || getPrivilegeKeys(user).includes("ADMIN_ACCESS");
}

function hasAnyPrivilege(user, privilegeKeys = []) {
  if (!privilegeKeys.length) {
    return true;
  }

  if (hasAdminAccess(user)) {
    return true;
  }

  const userPrivilegeKeys = getPrivilegeKeys(user);
  return privilegeKeys.some((privilegeKey) => userPrivilegeKeys.includes(privilegeKey));
}

function getAccessibleQuickActions(user) {
  const isAdmin = hasAdminAccess(user);
  const actions = DASHBOARD_ACTIONS.filter((action) => hasAnyPrivilege(user, action.requiredAnyPrivileges));

  if (isAdmin) {
    return actions.slice(0, 6);
  }

  return actions.filter((action) => action.id !== "manage-groups").slice(0, 5);
}

function canAccessMoneySites(user) {
  return hasAnyPrivilege(user, MONEY_SITE_PRIVILEGES);
}

async function getMoneySiteCounts(enabled) {
  if (!enabled) {
    return {
      total: 0,
      blocked: 0,
      notBlocked: 0,
      unknown: 0,
    };
  }

  const [total, blocked, notBlocked, unknown] = await Promise.all([
    MoneySite.countDocuments(),
    MoneySite.countDocuments({ "nawala.status": "ada" }),
    MoneySite.countDocuments({ "nawala.status": "tidak ada" }),
    MoneySite.countDocuments({ "nawala.status": "unknown" }),
  ]);

  return {
    total,
    blocked,
    notBlocked,
    unknown,
  };
}

function buildProfileSummary(user, lastLoginAt) {
  const privileges = user?.groupId?.privilegeIds || [];
  const role = hasAdminAccess(user) ? "Administrator" : "User";

  return {
    initials: (user?.fullName || "U").trim().charAt(0).toUpperCase() || "U",
    username: user?.fullName || "Unknown User",
    email: user?.email || "",
    role,
    group: user?.groupId?.name || "No group assigned",
    lastLoginAt: lastLoginAt || null,
    permissionsSummary: {
      total: privileges.length,
      preview: privileges.slice(0, 4).map((privilege) => privilege.name),
      remaining: Math.max(0, privileges.length - 4),
    },
    actions: [
      { label: "My Profile", path: "/my-profile" },
      { label: "Change Username", path: "/my-profile#change-username" },
      { label: "Change Password", path: "/my-profile#change-password" },
      { label: "View Details", path: "/my-profile#permissions-summary" },
    ],
  };
}

function buildRecentActivityItems(items = []) {
  return items.map((item) => ({
    id: item._id,
    summary: item.summary,
    module: item.module,
    action: item.action,
    actorName: item.actorName || item.actorEmail || "System",
    occurredAt: item.occurredAt,
    routePath: item.routePath,
    statusCode: item.statusCode,
  }));
}

async function getLastLoginAt(userId) {
  const lastLogin = await ActivityLog.findOne({
    actorUserId: userId,
    action: "auth.login",
  })
    .sort({ occurredAt: -1 })
    .select("occurredAt");

  return lastLogin?.occurredAt || null;
}

async function getRecentActivity(user, isAdmin) {
  const query = isAdmin ? {} : { actorUserId: user._id };

  const items = await ActivityLog.find(query)
    .sort({ occurredAt: -1 })
    .limit(6)
    .select("summary module action actorName actorEmail occurredAt routePath statusCode");

  return buildRecentActivityItems(items);
}

async function getActivityByModule(query) {
  return ActivityLog.aggregate([
    { $match: query },
    { $group: { _id: "$module", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 5 },
  ]);
}

async function getAdminDashboard(user) {
  const moneySiteAccess = canAccessMoneySites(user);
  const [
    totalUsers,
    activeUsers,
    inactiveUsers,
    totalGroups,
    protectedGroups,
    totalBrands,
    totalDomains,
    pendingPasswordResets,
    unassignedDomains,
    completedDomains,
    inProgressDomains,
    recentActivity,
    moduleActivity,
    lastLoginAt,
    moneySiteCounts,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: "active" }),
    User.countDocuments({ status: "inactive" }),
    Group.countDocuments(),
    Group.countDocuments({ isProtected: true }),
    Brand.countDocuments(),
    DevelopmentDomain.countDocuments(),
    PasswordResetRequest.countDocuments({ status: "pending" }),
    DevelopmentDomain.countDocuments({ assignedDeveloperId: null }),
    DevelopmentDomain.countDocuments({ developmentStatus: "completed" }),
    DevelopmentDomain.countDocuments({ developmentStatus: "in-progress" }),
    getRecentActivity(user, true),
    getActivityByModule({
      occurredAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    }),
    getLastLoginAt(user._id),
    getMoneySiteCounts(moneySiteAccess),
  ]);

  const totalModuleActivity = moduleActivity.reduce((sum, item) => sum + item.count, 0) || 1;

  const alerts = [
    pendingPasswordResets > 0
      ? {
          id: "pending-resets",
          tone: "warning",
          title: "Pending password reset approvals",
          message: `${pendingPasswordResets} reset request${pendingPasswordResets === 1 ? "" : "s"} waiting for review.`,
        }
      : null,
    inactiveUsers > 0
      ? {
          id: "inactive-users",
          tone: "info",
          title: "Inactive accounts detected",
          message: `${inactiveUsers} user account${inactiveUsers === 1 ? "" : "s"} currently inactive.`,
        }
      : null,
    unassignedDomains > 0
      ? {
          id: "unassigned-domains",
          tone: "warning",
          title: "Unassigned development workload",
          message: `${unassignedDomains} domain${unassignedDomains === 1 ? "" : "s"} do not have an assigned developer.`,
        }
      : null,
    moneySiteAccess && moneySiteCounts.blocked > 0
      ? {
          id: "blocked-money-sites",
          tone: "warning",
          title: "Blocked money sites detected",
          message: `${moneySiteCounts.blocked} money site${moneySiteCounts.blocked === 1 ? "" : "s"} currently show as blocked.`,
          path: "/money-sites",
        }
      : null,
    {
      id: "protected-groups",
      tone: "neutral",
      title: "Protected access groups",
      message: `${protectedGroups} protected group${protectedGroups === 1 ? "" : "s"} locked against deletion.`,
    },
  ].filter(Boolean);

  return {
    role: "admin",
    header: {
      title: "Dashboard",
      welcome: `Welcome back, ${user.fullName}`,
      subtitle: "Monitor users, access, development progress, and the latest system activity from one place.",
      notificationCount: alerts.length,
    },
    summaryCards: [
      {
        id: "total-users",
        label: "Total Users",
        value: totalUsers,
        description: `${activeUsers} active users currently able to access the workspace`,
        tone: "primary",
        icon: "users",
      },
      {
        id: "groups",
        label: "Access Groups",
        value: totalGroups,
        description: `${protectedGroups} protected groups managed by the system`,
        tone: "neutral",
        icon: "groups",
      },
      {
        id: "brands",
        label: "Tracked Brands",
        value: totalBrands,
        description: "Brands available for management and downstream workflows",
        tone: "neutral",
        icon: "brands",
      },
      ...(moneySiteAccess
        ? [
            {
              id: "money-sites-total",
              label: "Total Money Sites",
              value: moneySiteCounts.total,
              description: `${moneySiteCounts.notBlocked} clear, ${moneySiteCounts.unknown} not checked`,
              tone: "neutral",
              icon: "link",
            },
            {
              id: "money-sites-blocked",
              label: "Blocked Money Sites",
              value: moneySiteCounts.blocked,
              description: "Live blocked count from the checker feed",
              tone: moneySiteCounts.blocked > 0 ? "warning" : "success",
              icon: "shield",
            },
          ]
        : []),
      {
        id: "domains",
        label: "Development Domains",
        value: totalDomains,
        description: `${inProgressDomains} in progress, ${completedDomains} completed`,
        tone: "info",
        icon: "tasks",
      },
      {
        id: "resets",
        label: "Pending Resets",
        value: pendingPasswordResets,
        description: "Password reset requests waiting for admin action",
        tone: pendingPasswordResets > 0 ? "warning" : "success",
        icon: "shield",
      },
    ],
    quickActions: getAccessibleQuickActions(user),
    recentActivity,
    alerts,
    profileSummary: buildProfileSummary(user, lastLoginAt),
    analytics: {
      title: "System Analytics",
      subtitle: "A compact view of current delivery flow and recent module activity.",
      sections: [
        {
          id: "module-activity",
          title: "Module Activity",
          description: "Actions recorded across the last 14 days.",
          items: moduleActivity.map((item) => ({
            label: item._id || "unknown",
            value: item.count,
            progress: Math.round((item.count / totalModuleActivity) * 100),
            meta: `${item.count} recorded action${item.count === 1 ? "" : "s"}`,
          })),
        },
        {
          id: "delivery-health",
          title: "Delivery Health",
          description: "Current distribution of development work and account readiness.",
          items: [
            {
              label: "Completed domains",
              value: completedDomains,
              progress: totalDomains ? Math.round((completedDomains / totalDomains) * 100) : 0,
              meta: "Development status completed",
            },
            {
              label: "In-progress domains",
              value: inProgressDomains,
              progress: totalDomains ? Math.round((inProgressDomains / totalDomains) * 100) : 0,
              meta: "Currently being worked on",
            },
            {
              label: "Active users",
              value: activeUsers,
              progress: totalUsers ? Math.round((activeUsers / totalUsers) * 100) : 0,
              meta: "Accounts in active state",
            },
          ],
        },
      ],
    },
  };
}

async function getUserDashboard(user) {
  const userPrivilegeKeys = getPrivilegeKeys(user);
  const activityWindowStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const moneySiteAccess = canAccessMoneySites(user);
  const developmentAccess = hasAnyPrivilege(user, DEVELOPMENT_PRIVILEGES);

  const [
    assignedDomains,
    completedDomains,
    inProgressDomains,
    recentActivity,
    moduleActivity,
    lastLoginAt,
    recentActionCount,
    moneySiteCounts,
  ] = await Promise.all([
    developmentAccess
      ? DevelopmentDomain.countDocuments({
          $or: [{ assignedDeveloperId: user._id }, { contentEditorId: user._id }],
        })
      : Promise.resolve(0),
    developmentAccess
      ? DevelopmentDomain.countDocuments({
          $or: [{ assignedDeveloperId: user._id }, { contentEditorId: user._id }],
          developmentStatus: "completed",
        })
      : Promise.resolve(0),
    developmentAccess
      ? DevelopmentDomain.countDocuments({
          $or: [{ assignedDeveloperId: user._id }, { contentEditorId: user._id }],
          developmentStatus: "in-progress",
        })
      : Promise.resolve(0),
    getRecentActivity(user, false),
    getActivityByModule({
      actorUserId: user._id,
      occurredAt: { $gte: activityWindowStart },
    }),
    getLastLoginAt(user._id),
    ActivityLog.countDocuments({
      actorUserId: user._id,
      occurredAt: { $gte: activityWindowStart },
    }),
    getMoneySiteCounts(moneySiteAccess),
  ]);

  const accessibleQuickActions = getAccessibleQuickActions(user);
  const totalModuleActivity = moduleActivity.reduce((sum, item) => sum + item.count, 0) || 1;
  const accessibleModules = new Set(accessibleQuickActions.map((action) => action.path)).size;

  const alerts = [
    developmentAccess && assignedDomains > 0 && completedDomains < assignedDomains
      ? {
          id: "open-work",
          tone: "warning",
          title: "Open assigned work",
          message: `${assignedDomains - completedDomains} assigned domain${assignedDomains - completedDomains === 1 ? "" : "s"} still need progress.`,
        }
      : null,
    moneySiteAccess && moneySiteCounts.blocked > 0
      ? {
          id: "blocked-money-sites",
          tone: "warning",
          title: "Blocked money sites detected",
          message: `${moneySiteCounts.blocked} money site${moneySiteCounts.blocked === 1 ? "" : "s"} currently show as blocked.`,
          path: "/money-sites",
        }
      : null,
    {
      id: "permissions-summary",
      tone: "info",
      title: "Access is group-based",
      message: `${userPrivilegeKeys.length} privilege${userPrivilegeKeys.length === 1 ? "" : "s"} inherited from ${user.groupId?.name || "your current group"}.`,
    },
    {
      id: "profile-reminder",
      tone: "neutral",
      title: "Keep your profile current",
      message: "Use the profile panel to update your username and password when needed.",
    },
  ].filter(Boolean);

  return {
    role: "user",
    header: {
      title: "Dashboard",
      welcome: `Welcome back, ${user.fullName}`,
      subtitle: "Track your recent work, jump into the modules you can access, and keep your account up to date.",
      notificationCount: alerts.length,
    },
    summaryCards: [
      {
        id: "my-access",
        label: "Accessible Modules",
        value: accessibleModules,
        description: "Workspace areas currently available to your account",
        tone: "primary",
        icon: "dashboard",
      },
      {
        id: "my-permissions",
        label: "Permissions",
        value: userPrivilegeKeys.length,
        description: "Privileges inherited from your assigned group",
        tone: "neutral",
        icon: "shield",
      },
      ...(developmentAccess
        ? [
            {
              id: "my-work",
              label: "Assigned Domains",
              value: assignedDomains,
              description: `${inProgressDomains} in progress, ${completedDomains} completed`,
              tone: "info",
              icon: "tasks",
            },
          ]
        : []),
      ...(moneySiteAccess
        ? [
            {
              id: "money-sites-total",
              label: "Total Money Sites",
              value: moneySiteCounts.total,
              description: `${moneySiteCounts.notBlocked} clear, ${moneySiteCounts.unknown} not checked`,
              tone: "neutral",
              icon: "link",
            },
            {
              id: "money-sites-blocked",
              label: "Blocked Money Sites",
              value: moneySiteCounts.blocked,
              description: "Live blocked count from the checker feed",
              tone: moneySiteCounts.blocked > 0 ? "warning" : "success",
              icon: "shield",
            },
          ]
        : []),
      {
        id: "my-activity",
        label: "Recent Activity",
        value: recentActionCount,
        description: "Actions recorded for your account over the last 14 days",
        tone: "neutral",
        icon: "history",
      },
    ],
    quickActions: accessibleQuickActions,
    recentActivity,
    alerts,
    profileSummary: buildProfileSummary(user, lastLoginAt),
    analytics: {
      title: "Personal Analytics",
      subtitle: "A focused view of your recent account activity and assigned delivery workload.",
      sections: [
        {
          id: "module-activity",
          title: "Activity by Module",
          description: "Your recorded actions across the last 14 days.",
          items: moduleActivity.map((item) => ({
            label: item._id || "unknown",
            value: item.count,
            progress: Math.round((item.count / totalModuleActivity) * 100),
            meta: `${item.count} personal action${item.count === 1 ? "" : "s"}`,
          })),
        },
        ...(developmentAccess
          ? [
              {
                id: "workload",
                title: "Workload Progress",
                description: "Delivery progress for domains assigned to you.",
                items: [
                  {
                    label: "Completed domains",
                    value: completedDomains,
                    progress: assignedDomains ? Math.round((completedDomains / assignedDomains) * 100) : 0,
                    meta: "Assigned domains in completed state",
                  },
                  {
                    label: "In-progress domains",
                    value: inProgressDomains,
                    progress: assignedDomains ? Math.round((inProgressDomains / assignedDomains) * 100) : 0,
                    meta: "Assigned domains being actively worked on",
                  },
                  {
                    label: "Pending domains",
                    value: Math.max(0, assignedDomains - completedDomains - inProgressDomains),
                    progress: assignedDomains
                      ? Math.round((Math.max(0, assignedDomains - completedDomains - inProgressDomains) / assignedDomains) * 100)
                      : 0,
                    meta: "Assigned domains still in new state",
                  },
                ],
              },
            ]
          : []),
      ],
    },
  };
}

export async function getDashboardOverview(user) {
  if (hasAdminAccess(user)) {
    return getAdminDashboard(user);
  }

  return getUserDashboard(user);
}
