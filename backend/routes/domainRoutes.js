const express = require("express");
const {
  createDomain,
  getDomainsByBatch,
} = require("../controllers/domainController");

const router = express.Router();

router.post("/", createDomain);
router.get("/batch/:batchId", getDomainsByBatch);

module.exports = router;