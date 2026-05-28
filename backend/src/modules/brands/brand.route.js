import express from "express";
import {
  createBrand,
  deleteBrand,
  getBrand,
  getBrands,
  updateBrand,
} from "./brand.controller.js";
import {
  requireAuth,
  requirePrivilege,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", getBrands);
router.get("/:id", getBrand);
router.post("/", requirePrivilege("CREATE_BRANDS"), createBrand);
router.put("/:id", requirePrivilege("EDIT_BRANDS"), updateBrand);
router.delete("/:id", requirePrivilege("DELETE_BRANDS"), deleteBrand);

export default router;
