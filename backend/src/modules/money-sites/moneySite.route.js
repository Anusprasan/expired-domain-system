import express from "express";
import {
  bulkDeleteBlockedMoneySites,
  bulkUpdateMoneySiteStatuses,
  createMoneySite,
  deleteAllMoneySites,
  deleteMoneySite,
  exportMoneySitesCsv,
  getMoneySiteActivityLogs,
  getMoneySiteDomains,
  getMoneySitePushConfig,
  getMoneySiteSummary,
  getMoneySites,
  importMoneySitesCsv,
  previewMoneySitesCsvImport,
  requestDeleteAllMoneySitesVerification,
  requestMoneySitesCsvImportVerification,
  subscribeMoneySitePush,
  unsubscribeMoneySitePush,
  updateMoneySite,
} from "./moneySite.controller.js";
import {
  requireAnyPrivilege,
  requireAdminAccess,
  requireAuth,
  requirePrivilege,
} from "../../app/middleware/auth.middleware.js";
import { MONEY_SITE_ACCESS_PRIVILEGES } from "./moneySite.constants.js";

const router = express.Router();

router.use(requireAuth);

router.get(
  "/",
  requireAnyPrivilege(MONEY_SITE_ACCESS_PRIVILEGES.filter((key) => key !== "ADMIN_ACCESS")),
  getMoneySites
);
router.get(
  "/domains",
  requireAnyPrivilege(MONEY_SITE_ACCESS_PRIVILEGES.filter((key) => key !== "ADMIN_ACCESS")),
  getMoneySiteDomains
);
router.get(
  "/summary",
  requireAnyPrivilege(MONEY_SITE_ACCESS_PRIVILEGES.filter((key) => key !== "ADMIN_ACCESS")),
  getMoneySiteSummary
);
router.get("/export", requirePrivilege("VIEW_MONEY_SITES"), exportMoneySitesCsv);
router.get("/activity", requireAdminAccess, getMoneySiteActivityLogs);
router.get(
  "/push/config",
  requireAnyPrivilege(MONEY_SITE_ACCESS_PRIVILEGES.filter((key) => key !== "ADMIN_ACCESS")),
  getMoneySitePushConfig
);
router.post(
  "/push/subscribe",
  requireAnyPrivilege(MONEY_SITE_ACCESS_PRIVILEGES.filter((key) => key !== "ADMIN_ACCESS")),
  subscribeMoneySitePush
);
router.delete(
  "/push/subscribe",
  requireAnyPrivilege(MONEY_SITE_ACCESS_PRIVILEGES.filter((key) => key !== "ADMIN_ACCESS")),
  unsubscribeMoneySitePush
);
router.post("/", requirePrivilege("CREATE_MONEY_SITES"), createMoneySite);
router.post("/import/preview", requirePrivilege("CREATE_MONEY_SITES"), previewMoneySitesCsvImport);
router.post(
  "/import/verification/request",
  requirePrivilege("CREATE_MONEY_SITES"),
  requestMoneySitesCsvImportVerification
);
router.post("/import", requirePrivilege("CREATE_MONEY_SITES"), importMoneySitesCsv);
router.post(
  "/nawala/bulk-update",
  requirePrivilege("EDIT_MONEY_SITES"),
  bulkUpdateMoneySiteStatuses
);
router.post(
  "/delete-all/verification/request",
  requirePrivilege("DELETE_MONEY_SITES"),
  requestDeleteAllMoneySitesVerification
);
router.post("/delete-all", requirePrivilege("DELETE_MONEY_SITES"), deleteAllMoneySites);
router.post("/bulk-delete-blocked", requirePrivilege("DELETE_MONEY_SITES"), bulkDeleteBlockedMoneySites);
router.put("/:id", requirePrivilege("EDIT_MONEY_SITES"), updateMoneySite);
router.delete("/:id", requirePrivilege("DELETE_MONEY_SITES"), deleteMoneySite);

export default router;
