import express from "express";
import {
  acquireDevelopmentContentLock,
  assignDevelopmentDomain,
  createDevelopmentDomain,
  createDevelopmentTemplate,
  deleteDevelopmentDomain,
  deleteDevelopmentTemplate,
  getAssignableDevelopers,
  getDevelopmentDomain,
  getDevelopmentDomains,
  getDevelopmentTemplates,
  releaseDevelopmentContentLock,
  updateDevelopmentDomain,
  updateDevelopmentProgress,
  updateDevelopmentTemplate,
} from "./development.controller.js";
import {
  requireAnyPrivilege,
  requireAuth,
  requirePrivilege,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get(
  "/developers",
  requireAnyPrivilege(["ASSIGN_DEVELOPMENT", "VIEW_DEVELOPMENT_PROGRESS", "ADMIN_ACCESS"]),
  getAssignableDevelopers
);

router.get(
  "/templates",
  requireAnyPrivilege([
    "CREATE_DOMAINS",
    "EDIT_DOMAINS",
    "DELETE_DOMAINS",
    "ADD_TEMPLATES",
    "ASSIGN_DEVELOPMENT",
    "DO_DEVELOPMENT",
    "VIEW_DEVELOPMENT_PROGRESS",
    "ADMIN_ACCESS",
  ]),
  getDevelopmentTemplates
);
router.post("/templates", requirePrivilege("ADD_TEMPLATES"), createDevelopmentTemplate);
router.put("/templates/:id", requirePrivilege("EDIT_DOMAINS"), updateDevelopmentTemplate);
router.delete("/templates/:id", requirePrivilege("DELETE_DOMAINS"), deleteDevelopmentTemplate);

router.get(
  "/domains",
  requireAnyPrivilege([
    "CREATE_DOMAINS",
    "EDIT_DOMAINS",
    "DELETE_DOMAINS",
    "ASSIGN_DEVELOPMENT",
    "ADD_CONTENT",
    "EDIT_CONTENT",
    "DO_DEVELOPMENT",
    "VIEW_DEVELOPMENT_PROGRESS",
    "ADMIN_ACCESS",
  ]),
  getDevelopmentDomains
);
router.get(
  "/domains/:id",
  requireAnyPrivilege([
    "CREATE_DOMAINS",
    "EDIT_DOMAINS",
    "DELETE_DOMAINS",
    "ASSIGN_DEVELOPMENT",
    "ADD_CONTENT",
    "EDIT_CONTENT",
    "DO_DEVELOPMENT",
    "VIEW_DEVELOPMENT_PROGRESS",
    "ADMIN_ACCESS",
  ]),
  getDevelopmentDomain
);
router.post("/domains", requirePrivilege("CREATE_DOMAINS"), createDevelopmentDomain);
router.put(
  "/domains/:id",
  requireAnyPrivilege(["EDIT_DOMAINS", "ASSIGN_DEVELOPMENT", "ADD_CONTENT", "EDIT_CONTENT", "ADMIN_ACCESS"]),
  updateDevelopmentDomain
);
router.patch(
  "/domains/:id/assign",
  requireAnyPrivilege(["ASSIGN_DEVELOPMENT", "ADMIN_ACCESS"]),
  assignDevelopmentDomain
);
router.patch(
  "/domains/:id/content-lock",
  requireAnyPrivilege(["ASSIGN_DEVELOPMENT", "ADD_CONTENT", "EDIT_CONTENT", "ADMIN_ACCESS"]),
  acquireDevelopmentContentLock
);
router.delete(
  "/domains/:id/content-lock",
  requireAnyPrivilege(["ASSIGN_DEVELOPMENT", "ADD_CONTENT", "EDIT_CONTENT", "ADMIN_ACCESS"]),
  releaseDevelopmentContentLock
);
router.patch(
  "/domains/:id/progress",
  requireAnyPrivilege(["DO_DEVELOPMENT", "ASSIGN_DEVELOPMENT", "ADMIN_ACCESS"]),
  updateDevelopmentProgress
);
router.delete("/domains/:id", requirePrivilege("DELETE_DOMAINS"), deleteDevelopmentDomain);

export default router;
