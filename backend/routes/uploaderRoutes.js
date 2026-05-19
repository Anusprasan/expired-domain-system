const express = require("express");

const {
  pasteDomains,
  getMyDraftPreview,
  deleteMyDraftDomain,
  moveToProcess,
  getCurrentBatch,
} = require("../controllers/uploaderController");

const {
  protect,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

const router = express.Router();

router.post(
  "/paste",
  protect,
  authorizeRoles("uploader"),
  pasteDomains
);

router.get(
  "/my-preview",
  protect,
  authorizeRoles("uploader"),
  getMyDraftPreview
);


router.delete(
  "/my-domains/:id",
  protect,
  authorizeRoles("uploader"),
  deleteMyDraftDomain
);

router.post(
  "/move-to-process",
  protect,
  authorizeRoles("uploader"),
  moveToProcess
);

router.get(
  "/current-batch",
  protect,
  authorizeRoles("uploader"),
  getCurrentBatch
);
      
module.exports = router;