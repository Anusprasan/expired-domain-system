const { ZodError } = require('zod');
const {
  serpCheckSchema,
  bulkDomainCheckSchema,
  trustPositifBatchCheckSchema,
} = require('../utils/validation');
const { checkTrustPositifDomains } = require('../services/trustPositifService');

const buildKnownErrorPayload = (error) => {
  const payload = { error: error.message || 'Request failed' };

  if (error.errorCode) {
    payload.code = error.errorCode;
  }

  if (error.serperAvailability) {
    payload.serperAvailability = error.serperAvailability;
  }

  if (error.details !== undefined) {
    payload.details = error.details;
  }

  return payload;
};

const handleSerpError = (error, res, next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Validation error', details: error.flatten() });
  }

  if (error.statusCode) {
    return res.status(error.statusCode).json(buildKnownErrorPayload(error));
  }

  if (error.response) {
    const status = error.response?.status || 502;
    return res.status(status === 200 ? 502 : status).json({
      error: 'Failed to fetch SERP data from Serper',
      details: error.response?.data || error.message,
    });
  }

  return next(error);
};

const createSerpController = ({ serpRunService, keyRotationService }) => {
  const getAvailability = async (req, res, next) => {
    try {
      const availability = await keyRotationService.getAvailability();
      return res.json(availability);
    } catch (error) {
      return handleSerpError(error, res, next);
    }
  };

  const checkTopTen = async (req, res, next) => {
    try {
      const payload = serpCheckSchema.parse(req.body);
      const responsePayload = await serpRunService.runCheckForBrand({
        brandId: payload.brandId,
        query: payload.query,
        country: payload.country,
        isMobile: payload.isMobile,
        trigger: 'manual',
        skipCache: true,
      });

      return res.json(responsePayload);
    } catch (error) {
      return handleSerpError(error, res, next);
    }
  };

  const bulkDomainCheck = async (req, res, next) => {
    try {
      const payload = bulkDomainCheckSchema.parse(req.body);
      const responsePayload = await serpRunService.runBulkDomainCheck({
        domains: payload.domains,
        minResults: payload.minResults,
        country: payload.country,
        isMobile: payload.isMobile,
      });

      return res.json(responsePayload);
    } catch (error) {
      return handleSerpError(error, res, next);
    }
  };

  const startBulkDomainCheck = async (req, res, next) => {
    try {
      const payload = bulkDomainCheckSchema.parse(req.body);
      const responsePayload = await serpRunService.startBulkDomainCheck({
        userId: req.user?._id,
        domains: payload.domains,
        minResults: payload.minResults,
        country: payload.country,
        isMobile: payload.isMobile,
      });

      return res.json(responsePayload);
    } catch (error) {
      return handleSerpError(error, res, next);
    }
  };

  const getBulkDomainCheck = async (req, res, next) => {
    try {
      const responsePayload = await serpRunService.getBulkDomainCheck({
        userId: req.user?._id,
        runId: req.params.runId,
      });

      return res.json(responsePayload);
    } catch (error) {
      return handleSerpError(error, res, next);
    }
  };

  const stopBulkDomainCheck = async (req, res, next) => {
    try {
      const responsePayload = await serpRunService.stopBulkDomainCheck({
        userId: req.user?._id,
        runId: req.params.runId,
      });

      return res.json(responsePayload);
    } catch (error) {
      return handleSerpError(error, res, next);
    }
  };

  const checkTrustPositifBulk = async (req, res, next) => {
    try {
      const payload = trustPositifBatchCheckSchema.parse(req.body);
      const responsePayload = await checkTrustPositifDomains({
        domains: payload.domains,
        batchSize: payload.batchSize,
      });

      return res.json(responsePayload);
    } catch (error) {
      return handleSerpError(error, res, next);
    }
  };

  return {
    getAvailability,
    checkTopTen,
    bulkDomainCheck,
    startBulkDomainCheck,
    getBulkDomainCheck,
    stopBulkDomainCheck,
    checkTrustPositifBulk,
  };
};

module.exports = createSerpController;
