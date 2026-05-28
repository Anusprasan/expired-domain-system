const { z } = require('zod');

const mongoIdSchema = z.string().min(1);
const supportedCountrySchema = z.enum([
  'id',
  'us',
  'in',
  'sg',
  'my',
  'th',
  'vn',
  'ph',
  'au',
  'gb',
  'ca',
  'de',
  'fr',
  'jp',
  'kr',
  'cn',
  'sa',
  'ae',
  'tr',
  'br',
  'ru',
  'za',
]);

const supportedLanguageSchema = z.enum([
  'id',
  'en',
  'ms',
  'th',
  'vi',
  'tl',
  'zh',
  'ja',
  'ko',
  'de',
  'fr',
  'ar',
  'pt',
  'ru',
  'tr',
]);

const serpCheckSchema = z.object({
  brandId: mongoIdSchema,
  query: z.string().trim().optional(),
  country: supportedCountrySchema.optional(),
  isMobile: z.boolean().optional(),
});

const bulkDomainCheckSchema = z.object({
  domains: z.string().trim().min(1),
  minResults: z.coerce.number().int().min(1).max(100).optional(),
  country: supportedCountrySchema.optional(),
  isMobile: z.boolean().optional(),
});

const trustPositifBatchCheckSchema = z.object({
  domains: z.union([
    z.string().trim().min(1),
    z.array(z.string().trim().min(1)).min(1),
  ]),
  batchSize: z.coerce.number().int().min(1).max(5).optional(),
});

const googleRankCheckSchema = z.object({
  brandId: mongoIdSchema,
  query: z.string().trim().optional(),
  country: supportedCountrySchema.optional(),
  language: supportedLanguageSchema.optional(),
  isMobile: z.boolean().optional(),
});

const googleRankAutoRunSchema = z.object({
  country: supportedCountrySchema.optional(),
  language: supportedLanguageSchema.optional(),
  isMobile: z.boolean().optional(),
});

module.exports = {
  mongoIdSchema,
  serpCheckSchema,
  bulkDomainCheckSchema,
  trustPositifBatchCheckSchema,
  googleRankCheckSchema,
  googleRankAutoRunSchema,
};
