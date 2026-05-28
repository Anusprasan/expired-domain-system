import express from "express";
import { getAllPrivileges } from "./privilege.controller.js";
import {
  requireAuth,
  requireAnyPrivilege,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();

router.get(
  "/",
  requireAuth,
  requireAnyPrivilege(["CREATE_GROUPS", "EDIT_GROUPS", "DELETE_GROUPS"]),
  getAllPrivileges
);

export default router;
