const express = require('express');
const{
    createBatch,
    getBatches,
    deleteBatch,
} = require("../controllers/batchController");
const router = express.Router();

router.post("/createBatch", createBatch);
router.get("/getBatches", getBatches);
router.delete("/deleteBatch/:batchId", deleteBatch);
module.exports = router;