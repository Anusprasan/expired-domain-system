import express from "express";
import {
  checkAllCuttlyLinks,
  checkCuttlyLink,
  createCuttlyLink,
  deleteCuttlyLink,
  getCuttlySettings,
  getCuttlyStatus,
  listCuttlyLinks,
  toggleCuttlySchedule,
  updateCuttlyApiSettings,
  updateCuttlyLink,
  updateCuttlyScheduleSettings,
  updateCuttlyTelegramSettings,
} from "./cuttlyLinkChecker.controller.js";
import {
  requireAnyPrivilege,
  requireAuth,
  requirePrivilege,
} from "../../app/middleware/auth.middleware.js";

export const CUTTLY_LINK_CHECKER_ACCESS_PRIVILEGES = [
  "VIEW_CUTTLY_LINK_CHECKER",
  "MANAGE_CUTTLY_LINK_CHECKER",
  "CHECK_CUTTLY_LINKS",
  "SCHEDULE_CUTTLY_LINK_CHECKER",
  "MANAGE_CUTTLY_API_SETTINGS",
  "MANAGE_CUTTLY_LINK_TELEGRAM",
];

const router = express.Router();

router.use(requireAuth);

router.get("/", requireAnyPrivilege(CUTTLY_LINK_CHECKER_ACCESS_PRIVILEGES), listCuttlyLinks);
router.get("/status", requireAnyPrivilege(CUTTLY_LINK_CHECKER_ACCESS_PRIVILEGES), getCuttlyStatus);
router.get("/settings", requireAnyPrivilege(CUTTLY_LINK_CHECKER_ACCESS_PRIVILEGES), getCuttlySettings);
router.put("/settings/api", requirePrivilege("MANAGE_CUTTLY_API_SETTINGS"), updateCuttlyApiSettings);
router.put("/telegram", requirePrivilege("MANAGE_CUTTLY_LINK_TELEGRAM"), updateCuttlyTelegramSettings);
router.put("/schedule", requirePrivilege("SCHEDULE_CUTTLY_LINK_CHECKER"), updateCuttlyScheduleSettings);
router.post("/schedule/toggle", requirePrivilege("SCHEDULE_CUTTLY_LINK_CHECKER"), toggleCuttlySchedule);
router.post("/checks/run", requirePrivilege("CHECK_CUTTLY_LINKS"), checkAllCuttlyLinks);
router.post("/", requirePrivilege("MANAGE_CUTTLY_LINK_CHECKER"), createCuttlyLink);
router.put("/:id", requirePrivilege("MANAGE_CUTTLY_LINK_CHECKER"), updateCuttlyLink);
router.delete("/:id", requirePrivilege("MANAGE_CUTTLY_LINK_CHECKER"), deleteCuttlyLink);
router.post("/:id/check", requirePrivilege("CHECK_CUTTLY_LINKS"), checkCuttlyLink);

export default router;
