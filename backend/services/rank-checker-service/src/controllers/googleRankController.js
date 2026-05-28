const { ZodError } = require('zod');
const { googleRankCheckSchema, googleRankAutoRunSchema } = require('../utils/validation');

const buildKnownErrorPayload = (error) => {
  const payload = { error: error.message || 'Request failed' };

  if (error.errorCode) {
    payload.code = error.errorCode;
  }

  if (error.details !== undefined) {
    payload.details = error.details;
  }

  return payload;
};

const handleGoogleRankError = (error, res, next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Validation error', details: error.flatten() });
  }

  if (error.statusCode) {
    return res.status(error.statusCode).json(buildKnownErrorPayload(error));
  }

  if (error.response) {
    const status = error.response?.status || 502;
    return res.status(status === 200 ? 502 : status).json({
      error: 'Failed to fetch Google Rank data from SerpAPI',
      details: error.response?.data || error.message,
    });
  }

  return next(error);
};

const createGoogleRankController = ({ googleRankService }) => {
  const getAvailability = async (req, res, next) => {
    try {
      const payload = await googleRankService.getGoogleRankAvailability();
      return res.json(payload);
    } catch (error) {
      return handleGoogleRankError(error, res, next);
    }
  };

  const check = async (req, res, next) => {
    try {
      const payload = googleRankCheckSchema.parse(req.body);
      const responsePayload = await googleRankService.searchGoogleRankForBrand({
        brandId: payload.brandId,
        query: payload.query,
        country: payload.country,
        language: payload.language,
        isMobile: payload.isMobile,
      });

      return res.json(responsePayload);
    } catch (error) {
      return handleGoogleRankError(error, res, next);
    }
  };

  const startAutoRun = async (req, res, next) => {
    try {
      const input = googleRankAutoRunSchema.parse(req.body || {});
      const payload = await googleRankService.startAutoGoogleRankRun({
        userId: req.user?._id,
        country: input.country,
        language: input.language,
        isMobile: input.isMobile,
      });

      return res.json(payload);
    } catch (error) {
      return handleGoogleRankError(error, res, next);
    }
  };

  const getAutoRun = async (req, res, next) => {
    try {
      const payload = await googleRankService.getAutoGoogleRankRun({
        userId: req.user?._id,
        runId: req.params.runId,
      });

      return res.json(payload);
    } catch (error) {
      return handleGoogleRankError(error, res, next);
    }
  };

  const stopAutoRun = async (req, res, next) => {
    try {
      const payload = await googleRankService.stopAutoGoogleRankRun({
        userId: req.user?._id,
        runId: req.params.runId,
      });

      return res.json(payload);
    } catch (error) {
      return handleGoogleRankError(error, res, next);
    }
  };

  return {
    getAvailability,
    check,
    startAutoRun,
    getAutoRun,
    stopAutoRun,
  };
};

module.exports = createGoogleRankController;
