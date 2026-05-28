import { createActivityLog } from "../../modules/activity-logs/activityLog.service.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const ROUTE_ACTIVITY_RULES = [
  {
    method: "POST",
    pattern: /^\/api\/users$/,
    module: "users",
    action: "user.create",
    targetType: "user",
    summary: "Created a user",
  },
  {
    method: "PUT",
    pattern: /^\/api\/users\/[^/]+$/,
    module: "users",
    action: "user.update",
    targetType: "user",
    summary: "Updated a user",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/users\/[^/]+\/group$/,
    module: "users",
    action: "user.change-group",
    targetType: "user",
    summary: "Changed a user's group",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/users\/[^/]+\/status$/,
    module: "users",
    action: "user.change-status",
    targetType: "user",
    summary: "Changed a user's status",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/users\/[^/]+$/,
    module: "users",
    action: "user.delete",
    targetType: "user",
    summary: "Deleted a user",
  },
  {
    method: "POST",
    pattern: /^\/api\/groups$/,
    module: "groups",
    action: "group.create",
    targetType: "group",
    summary: "Created a group",
  },
  {
    method: "PUT",
    pattern: /^\/api\/groups\/[^/]+$/,
    module: "groups",
    action: "group.update",
    targetType: "group",
    summary: "Updated a group",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/groups\/[^/]+$/,
    module: "groups",
    action: "group.delete",
    targetType: "group",
    summary: "Deleted a group",
  },
  {
    method: "POST",
    pattern: /^\/api\/brands$/,
    module: "brands",
    action: "brand.create",
    targetType: "brand",
    summary: "Created a brand",
  },
  {
    method: "PUT",
    pattern: /^\/api\/brands\/[^/]+$/,
    module: "brands",
    action: "brand.update",
    targetType: "brand",
    summary: "Updated a brand",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/brands\/[^/]+$/,
    module: "brands",
    action: "brand.delete",
    targetType: "brand",
    summary: "Deleted a brand",
  },
  {
    method: "POST",
    pattern: /^\/api\/money-sites$/,
    module: "money-sites",
    action: "money-site.create",
    targetType: "money-site",
    summary: "Created a money site",
  },
  {
    method: "POST",
    pattern: /^\/api\/money-sites\/import$/,
    module: "money-sites",
    action: "money-site.import",
    targetType: "money-site-import",
    summary: "Imported money sites from CSV",
  },
  {
    method: "POST",
    pattern: /^\/api\/money-sites\/delete-all$/,
    module: "money-sites",
    action: "money-site.delete-all",
    targetType: "money-site",
    summary: "Deleted all money sites",
  },
  {
    method: "POST",
    pattern: /^\/api\/money-sites\/bulk-delete-blocked$/,
    module: "money-sites",
    action: "money-site.bulk-delete-blocked",
    targetType: "money-site",
    summary: "Deleted blocked money sites",
  },
  {
    method: "PUT",
    pattern: /^\/api\/money-sites\/[^/]+$/,
    module: "money-sites",
    action: "money-site.update",
    targetType: "money-site",
    summary: "Updated a money site",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/money-sites\/[^/]+$/,
    module: "money-sites",
    action: "money-site.delete",
    targetType: "money-site",
    summary: "Deleted a money site",
  },
  {
    method: "POST",
    pattern: /^\/api\/reporting\/reports$/,
    module: "reporting",
    action: "reporting.report.create",
    targetType: "reporting-report",
    summary: "Created a reporting task",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/reporting\/reports\/[^/]+$/,
    module: "reporting",
    action: "reporting.report.update",
    targetType: "reporting-report",
    summary: "Updated a reporting task",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/reporting\/reports\/[^/]+$/,
    module: "reporting",
    action: "reporting.report.delete",
    targetType: "reporting-report",
    summary: "Deleted a reporting task",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/reporting\/reports\/[^/]+\/claim$/,
    module: "reporting",
    action: "reporting.report.claim",
    targetType: "reporting-report",
    summary: "Claimed a reporting task",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/reporting\/reports\/[^/]+\/status$/,
    module: "reporting",
    action: "reporting.report.status-update",
    targetType: "reporting-report",
    summary: "Updated a reporting task status",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/reporting\/reports\/[^/]+\/unclaim$/,
    module: "reporting",
    action: "reporting.report.unclaim",
    targetType: "reporting-report",
    summary: "Removed a reporting task from personal work",
  },
  {
    method: "POST",
    pattern: /^\/api\/reporting\/reports\/[^/]+\/submissions$/,
    module: "reporting",
    action: "reporting.submission.create",
    targetType: "reporting-report",
    summary: "Submitted reporting evidence",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/reporting\/reports\/[^/]+\/submissions\/[^/]+$/,
    module: "reporting",
    action: "reporting.submission.update",
    targetType: "reporting-report",
    summary: "Updated reporting evidence",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/reporting\/reports\/[^/]+\/claims\/[^/]+\/check$/,
    module: "reporting",
    action: "reporting.claim.checked",
    targetType: "reporting-report",
    summary: "Checked a reporting submission",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/reporting\/reports\/[^/]+\/claims\/[^/]+\/uncheck$/,
    module: "reporting",
    action: "reporting.claim.unchecked",
    targetType: "reporting-report",
    summary: "Reversed a checked reporting submission",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/reporting\/workflows\/[^/]+$/,
    module: "reporting",
    action: "reporting.workflow.update",
    targetType: "reporting-workflow",
    summary: "Updated a reporting workflow",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/reporting\/settings$/,
    module: "reporting",
    action: "reporting.settings.update",
    targetType: "user",
    summary: "Updated reporting settings",
  },
  {
    method: "POST",
    pattern: /^\/api\/reporting\/mail-profiles\/admin$/,
    module: "reporting",
    action: "reporting.smtp-profile.create",
    targetType: "reporting-smtp-profile",
    summary: "Created a reporting SMTP profile",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/reporting\/mail-profiles\/admin\/[^/]+$/,
    module: "reporting",
    action: "reporting.smtp-profile.update",
    targetType: "reporting-smtp-profile",
    summary: "Updated a reporting SMTP profile",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/reporting\/mail-profiles\/admin\/[^/]+$/,
    module: "reporting",
    action: "reporting.smtp-profile.delete",
    targetType: "reporting-smtp-profile",
    summary: "Deleted a reporting SMTP profile",
  },
  {
    method: "POST",
    pattern: /^\/api\/reporting\/mail-profiles\/admin\/[^/]+\/test$/,
    module: "reporting",
    action: "reporting.smtp-profile.test",
    targetType: "reporting-smtp-profile",
    summary: "Sent a reporting SMTP profile test email",
  },
  {
    method: "POST",
    pattern: /^\/api\/reporting\/mail-profiles\/mine$/,
    module: "reporting",
    action: "reporting.smtp-profile.personal.create",
    targetType: "reporting-smtp-profile",
    summary: "Created a personal reporting SMTP profile",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/reporting\/mail-profiles\/mine\/[^/]+$/,
    module: "reporting",
    action: "reporting.smtp-profile.personal.update",
    targetType: "reporting-smtp-profile",
    summary: "Updated a personal reporting SMTP profile",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/reporting\/mail-profiles\/mine\/[^/]+$/,
    module: "reporting",
    action: "reporting.smtp-profile.personal.delete",
    targetType: "reporting-smtp-profile",
    summary: "Deleted a personal reporting SMTP profile",
  },
  {
    method: "POST",
    pattern: /^\/api\/reporting\/mail-profiles\/mine\/[^/]+\/test$/,
    module: "reporting",
    action: "reporting.smtp-profile.personal.test",
    targetType: "reporting-smtp-profile",
    summary: "Sent a personal reporting SMTP profile test email",
  },
  {
    method: "POST",
    pattern: /^\/api\/reporting\/reports\/[^/]+\/ai\/generate$/,
    module: "reporting",
    action: "reporting.email.generate",
    targetType: "reporting-report",
    summary: "Generated an AI reporting email",
  },
  {
    method: "POST",
    pattern: /^\/api\/reporting\/reports\/[^/]+\/ai\/draft$/,
    module: "reporting",
    action: "reporting.email.draft-save",
    targetType: "reporting-report",
    summary: "Saved a reporting email draft",
  },
  {
    method: "POST",
    pattern: /^\/api\/reporting\/reports\/[^/]+\/ai\/send$/,
    module: "reporting",
    action: "reporting.email.send",
    targetType: "reporting-report",
    summary: "Sent a reporting email",
  },
  {
    method: "POST",
    pattern: /^\/api\/development\/templates$/,
    module: "development",
    action: "template.create",
    targetType: "template",
    summary: "Created a development template",
  },
  {
    method: "PUT",
    pattern: /^\/api\/development\/templates\/[^/]+$/,
    module: "development",
    action: "template.update",
    targetType: "template",
    summary: "Updated a development template",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/development\/templates\/[^/]+$/,
    module: "development",
    action: "template.delete",
    targetType: "template",
    summary: "Deleted a development template",
  },
  {
    method: "POST",
    pattern: /^\/api\/development\/domains$/,
    module: "development",
    action: "domain.create",
    targetType: "domain",
    summary: "Created a development domain",
  },
  {
    method: "PUT",
    pattern: /^\/api\/development\/domains\/[^/]+$/,
    module: "development",
    action: "domain.update",
    targetType: "domain",
    summary: "Updated a development domain",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/development\/domains\/[^/]+\/assign$/,
    module: "development",
    action: "domain.assign",
    targetType: "domain",
    summary: "Assigned development work",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/development\/domains\/[^/]+\/content-lock$/,
    module: "content",
    action: "content.lock",
    targetType: "domain",
    summary: "Started editing content",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/development\/domains\/[^/]+\/content-lock$/,
    module: "content",
    action: "content.unlock",
    targetType: "domain",
    summary: "Released a content lock",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/development\/domains\/[^/]+\/progress$/,
    module: "development",
    action: "domain.progress-update",
    targetType: "domain",
    summary: "Updated development progress",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/development\/domains\/[^/]+$/,
    module: "development",
    action: "domain.delete",
    targetType: "domain",
    summary: "Deleted a development domain",
  },
  {
    method: "POST",
    pattern: /^\/api\/article-pool\/articles$/,
    module: "article-pool",
    action: "article-pool.article.create",
    targetType: "article-pool-article",
    summary: "Created an article pool item",
  },
  {
    method: "POST",
    pattern: /^\/api\/article-pool\/import$/,
    module: "article-pool",
    action: "article-pool.article.import",
    targetType: "article-pool-import",
    summary: "Imported content pool items from CSV",
  },
  {
    method: "PUT",
    pattern: /^\/api\/article-pool\/articles\/[^/]+$/,
    module: "article-pool",
    action: "article-pool.article.update",
    targetType: "article-pool-article",
    summary: "Updated an article pool item",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/article-pool\/articles\/[^/]+$/,
    module: "article-pool",
    action: "article-pool.article.delete",
    targetType: "article-pool-article",
    summary: "Deleted an article pool item",
  },
  {
    method: "POST",
    pattern: /^\/api\/lp-servers$/,
    module: "lp-servers",
    action: "lp-server.create",
    targetType: "lp-server",
    summary: "Created an LP server",
  },
  {
    method: "POST",
    pattern: /^\/api\/lp-servers\/import$/,
    module: "lp-servers",
    action: "lp-server.import",
    targetType: "lp-server-import",
    summary: "Imported LP servers from CSV",
  },
  {
    method: "PUT",
    pattern: /^\/api\/lp-servers\/[^/]+$/,
    module: "lp-servers",
    action: "lp-server.update",
    targetType: "lp-server",
    summary: "Updated an LP server",
  },
  {
    method: "DELETE",
    pattern: /^\/api\/lp-servers\/[^/]+$/,
    module: "lp-servers",
    action: "lp-server.delete",
    targetType: "lp-server",
    summary: "Deleted an LP server",
  },
  {
    method: "POST",
    pattern: /^\/api\/password-reset\/requests\/[^/]+\/admin-reset$/,
    module: "password-resets",
    action: "password-reset.admin-reset",
    targetType: "password-reset-request",
    summary: "Reset another user's password",
  },
];

function getRoutePath(req) {
  return String(req.originalUrl || req.baseUrl || req.path || "").split("?")[0];
}

function getRouteActivityDefinition(req) {
  const routePath = getRoutePath(req);

  return ROUTE_ACTIVITY_RULES.find(
    (rule) => rule.method === req.method && rule.pattern.test(routePath)
  );
}

function getTargetId(req) {
  return String(
    req.auditLog?.targetId
    || req.params?.id
    || req.body?.id
    || req.body?.userId
    || req.body?.developerId
    || ""
  ).trim();
}

export function activityLogMiddleware(req, res, next) {
  req.auditLog = req.auditLog || {};
  req.auditLog.requestStartedAt = Date.now();

  res.on("finish", () => {
    if (!req.user || !WRITE_METHODS.has(req.method) || res.statusCode < 200 || res.statusCode >= 400) {
      return;
    }

    if (req.auditLog?.skipAutomaticLog) {
      return;
    }

    const definition = getRouteActivityDefinition(req);
    if (!definition) {
      return;
    }

    void createActivityLog({
      actorUser: req.user,
      module: req.auditLog?.module || definition.module,
      category: req.auditLog?.category || "data",
      action: req.auditLog?.action || definition.action,
      targetType: req.auditLog?.targetType || definition.targetType,
      targetId: getTargetId(req),
      targetLabel: req.auditLog?.targetLabel || "",
      summary: req.auditLog?.summary || definition.summary,
      details: req.auditLog?.details || "",
      httpMethod: req.method,
      routePath: getRoutePath(req),
      statusCode: res.statusCode,
      durationMs: Date.now() - (req.auditLog?.requestStartedAt || Date.now()),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: req.auditLog?.metadata || {},
    }).catch((error) => {
      console.error("Failed to write activity log:", error.message);
    });
  });

  next();
}
