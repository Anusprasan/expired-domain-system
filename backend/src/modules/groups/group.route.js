import express from "express";
import {
  createGroup,
  deleteGroup,
  getGroup,
  getGroups,
  updateGroup,
} from "./group.controller.js";
import {
  requireAuth,
  requireAnyPrivilege,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get(
  "/",
  requireAnyPrivilege(["CREATE_GROUPS", "EDIT_GROUPS", "DELETE_GROUPS", "CREATE_USERS", "EDIT_USERS"]),
  getGroups
);
router.get(
  "/:id",
  requireAnyPrivilege(["CREATE_GROUPS", "EDIT_GROUPS", "DELETE_GROUPS", "CREATE_USERS", "EDIT_USERS"]),
  getGroup
);
router.post("/", requireAnyPrivilege(["CREATE_GROUPS"]), createGroup);
router.put("/:id", requireAnyPrivilege(["EDIT_GROUPS"]), updateGroup);
router.delete("/:id", requireAnyPrivilege(["DELETE_GROUPS"]), deleteGroup);

export default router;
