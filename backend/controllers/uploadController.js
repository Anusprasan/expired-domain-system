const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

const Batch = require("../models/Batch");
const Domain = require("../models/Domain");

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded",
      });
    }

    const filePath = path.join(
      __dirname,
      "../uploads",
      req.file.filename
    );

    let domains = [];

    const ext = path.extname(req.file.originalname);

    // TXT FILE
    if (ext === ".txt") {
      const fileContent = fs.readFileSync(filePath, "utf-8");

      domains = fileContent
        .split(/\r?\n/)
        .map((domain) => domain.trim())
        .filter((domain) => domain !== "");
    }

    // EXCEL FILE
    else if (ext === ".xlsx") {
      const workbook = xlsx.readFile(filePath);

      const sheetName = workbook.SheetNames[0];

      const sheet = workbook.Sheets[sheetName];

      const data = xlsx.utils.sheet_to_json(sheet, {
        header: 1,
      });

      domains = data
        .flat()
        .map((domain) => String(domain).trim())
        .filter((domain) => domain !== "");
    }

    // INVALID FILE
    else {
      return res.status(400).json({
        message: "Only TXT and XLSX files allowed",
      });
    }

    domains = domains
        .map((domain) => domain.toLowerCase().trim())
        .filter((domain) => domain !== "")
        .filter((domain) => domain !== "domain")
        .filter((domain) => domain.includes("."));

    domains = [...new Set(domains)];

    const batch = await Batch.create({
      batchName: `Batch-${Date.now()}`,
      originalFileName: req.file.originalname,
      totalDomains: domains.length,
    });

    const domainDocs = domains.map((domainName) => ({
      domainName,
      batchId: batch._id,
    }));

    await Domain.insertMany(domainDocs);

    res.status(200).json({
      message: "File processed successfully",
      batch,
      totalDomains: domains.length,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "File processing failed",
    });
  }
};

module.exports = {
  uploadFile,
};