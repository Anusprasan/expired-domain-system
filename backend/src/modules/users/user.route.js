import express from "express";
import {
  changeUserGroup,
  changeUserStatus,
  createUser,
  deleteUser,
  getUser,
  getUsers,
  updateUser,
} from "./user.controller.js";
import {
  requireAuth,
  requireAnyPrivilege,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", requireAnyPrivilege(["CREATE_USERS", "EDIT_USERS", "DELETE_USERS"]), getUsers);
router.get("/:id", requireAnyPrivilege(["CREATE_USERS", "EDIT_USERS", "DELETE_USERS"]), getUser);
router.post("/", requireAnyPrivilege(["CREATE_USERS"]), createUser);
router.put("/:id", requireAnyPrivilege(["EDIT_USERS"]), updateUser);
router.patch("/:id/group", requireAnyPrivilege(["EDIT_USERS"]), changeUserGroup);
router.patch("/:id/status", requireAnyPrivilege(["EDIT_USERS"]), changeUserStatus);
router.delete("/:id", requireAnyPrivilege(["DELETE_USERS"]), deleteUser);

export default router;
