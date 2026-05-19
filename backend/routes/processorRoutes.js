const express = require("express");

const router = express.Router();

const {
  getPendingSubBatches,
  getCopiedSubBatches,
  getProcessedSubBatches,
  copySubBatch,
  moveToProcessed,
  viewSubBatchDomains,
  saveSeoResult,
  

} = require(
  "../controllers/processorController"
);

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

router.get(
  "/pending",
  protect,
  authorizeRoles(
    "processor",
    "admin"
  ),
  getPendingSubBatches
);

router.get(
  "/copied",
  protect,
  authorizeRoles(
    "processor",
    "admin"
  ),
  getCopiedSubBatches
);

router.get(
  "/processed",
  protect,
  authorizeRoles(
    "processor",
    "admin"
  ),
  getProcessedSubBatches
);
    
router.post(
  "/copy/:id",
  protect,
  authorizeRoles(
    "processor",
    "admin"
  ),
  copySubBatch
);

router.post(
  "/processed/:id",
  protect,
  authorizeRoles(
    "processor",
    "admin"
  ),
  moveToProcessed
);

router.get(
  "/view/:id",
  protect,
  authorizeRoles("processor", "admin"),
  viewSubBatchDomains
);


router.post(
  "/seo-result/:id",
  protect,
  authorizeRoles("processor", "admin"),
  saveSeoResult
);

module.exports = router;