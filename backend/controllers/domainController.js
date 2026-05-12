const Domain = require("../models/Domain");

const createDomain = async (req, res) => {
  try {
    const { domainName, batchId } = req.body;

    const domain = await Domain.create({
      domainName,
      batchId,
    });

    res.status(201).json(domain);
  } catch (error) {
    res.status(500).json({ message: "Error creating domain" });
  }
};

const getDomainsByBatch = async (req, res) => {
  try {
    const { batchId } = req.params;

    const domains = await Domain.find({ batchId }).sort({ createdAt: -1 });

    res.status(200).json(domains);
  } catch (error) {
    res.status(500).json({ message: "Error fetching domains" });
  }
};

module.exports = {
  createDomain,
  getDomainsByBatch,
};