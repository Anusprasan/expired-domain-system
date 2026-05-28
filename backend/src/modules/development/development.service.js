import mongoose from "mongoose";
import Brand from "../brands/brand.model.js";
import User from "../users/user.model.js";
import ArticlePoolArticle from "../article-pool/articlePoolArticle.model.js";
import DevelopmentDomain from "./developmentDomain.model.js";
import DevelopmentTemplate from "./developmentTemplate.model.js";

const DEVELOPMENT_PRIVILEGES = [
  "CREATE_DOMAINS",
  "EDIT_DOMAINS",
  "DELETE_DOMAINS",
  "ASSIGN_DEVELOPMENT",
  "DO_DEVELOPMENT",
  "VIEW_DEVELOPMENT_PROGRESS",
  "ADMIN_ACCESS",
];

const DEVELOPER_PRIVILEGE = "DO_DEVELOPMENT";
const BLOGGER_HOSTS = [
  "blogger.com",
  "blogspot.com",
  "blogger.googleusercontent.com",
  "googleusercontent.com",
];
const CONTENT_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

const populateDevelopmentDomain = [
  { path: "templateId", select: "name notes" },
  { path: "addedBy", select: "fullName email" },
  { path: "assignedBy", select: "fullName email" },
  { path: "assignedDeveloperId", select: "fullName email status" },
  { path: "contentEditorId", select: "fullName email status" },
  { path: "contentUpdatedBy", select: "fullName email status" },
  { path: "articlePoolArticleId", select: "brandName topic content.title content.summary" },
];

const normalizeText = (value) => String(value || "").trim().replace(/\s+/g, " ");

const extractBrandName = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const legacyMatch = value.match(/brandname['"]?\s*:\s*['"]([^'"]+)['"]/i);
    if (legacyMatch) {
      return legacyMatch[1].trim().toUpperCase();
    }

    return value.trim().toUpperCase();
  }

  if (typeof value === "object" && value.brandName) {
    return String(value.brandName).trim().toUpperCase();
  }

  return String(value).trim().toUpperCase();
};

const normalizeUrl = (value, fieldName) => {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    throw new Error(`${fieldName} is required`);
  }

  try {
    const normalized = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(rawValue)
      ? rawValue
      : `https://${rawValue}`;
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error();
    }
    return parsed.toString();
  } catch {
    throw new Error(`${fieldName} must be a valid URL`);
  }
};

const normalizeOptionalUrl = (value, fieldName) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  return normalizeUrl(value, fieldName);
};

const normalizeBloggerUrl = (value, fieldName) => {
  const normalized = normalizeUrl(value, fieldName);
  const hostname = new URL(normalized).hostname.toLowerCase();

  if (!BLOGGER_HOSTS.some((host) => hostname.includes(host))) {
    throw new Error(`${fieldName} must be a Google Blogger or Blogspot URL`);
  }

  return normalized;
};

const normalizeBloggerUrlList = (value, fieldName) => {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value.map((item) => normalizeBloggerUrl(item, fieldName));
};

const normalizeContent = (content = {}) => {
  if (typeof content !== "object" || Array.isArray(content) || content === null) {
    throw new Error("Content is invalid");
  }

  return {
    title: String(content.title || "").trim(),
    description: String(content.description || "").trim(),
    article: String(content.article || "").trim(),
    note: String(content.note || "").trim(),
  };
};

const mapArticlePoolArticleToContent = (article) => ({
  title: String(article?.content?.title || article?.topic || "").trim(),
  description: String(article?.content?.summary || "").trim(),
  article: String(article?.content?.body || "").trim(),
  note: String(article?.content?.note || "").trim(),
});

const mapArticlePoolArticleToResources = (article) => ({
  logos: article?.resources?.logos || [],
  gifs: article?.resources?.gifs || [],
  heroImage: article?.resources?.heroImage || "",
  favicon: article?.resources?.favicon || "",
});

const normalizeResources = (resources = {}) => {
  if (typeof resources !== "object" || Array.isArray(resources) || resources === null) {
    throw new Error("Resources are invalid");
  }

  return {
    logos: normalizeBloggerUrlList(resources.logos || [], "Logos"),
    gifs: normalizeBloggerUrlList(resources.gifs || [], "Gifs"),
    heroImage: resources.heroImage
      ? normalizeBloggerUrl(resources.heroImage, "Hero image")
      : "",
    favicon: resources.favicon
      ? normalizeBloggerUrl(resources.favicon, "Favicon")
      : "",
  };
};

const calculateProgressPercent = (domain) => {
  let progress = 0;

  if (domain.developmentStatus === "completed") {
    progress += 60;
  }

  if (domain.hostingStatus === "hosted") {
    progress += 30;
  }

  if (domain.gscStatus === "done") {
    progress += 10;
  }

  return Math.min(progress, 100);
};

const isContentLockExpired = (domain) => {
  if (!domain?.contentEditorId || !domain?.contentEditingAt) {
    return false;
  }

  const lockStartedAt = new Date(domain.contentEditingAt);

  if (Number.isNaN(lockStartedAt.getTime())) {
    return true;
  }

  return Date.now() - lockStartedAt.getTime() > CONTENT_LOCK_TIMEOUT_MS;
};

const clearExpiredContentLock = async (domain) => {
  if (!isContentLockExpired(domain)) {
    return domain;
  }

  domain.contentEditorId = null;
  domain.contentEditingAt = null;
  await domain.save();
  return domain;
};

const serializeDevelopmentDomain = (domain) => {
  const serialized = typeof domain.toObject === "function" ? domain.toObject() : { ...domain };

  return {
    ...serialized,
    brandName: extractBrandName(serialized.brandName),
    progressPercent: calculateProgressPercent(serialized),
  };
};

const getPrivilegeKeys = (user) =>
  user?.groupId?.privilegeIds?.map((privilege) => privilege.key) || [];

const hasAnyPrivilege = (user, privilegeKeys) => {
  const userPrivilegeKeys = getPrivilegeKeys(user);
  return privilegeKeys.some((privilegeKey) => userPrivilegeKeys.includes(privilegeKey));
};

const canViewAllDevelopment = (user) =>
  hasAnyPrivilege(user, [
    "CREATE_DOMAINS",
    "EDIT_DOMAINS",
    "DELETE_DOMAINS",
    "ASSIGN_DEVELOPMENT",
    "ADD_CONTENT",
    "EDIT_CONTENT",
    "ADMIN_ACCESS",
  ]);

const canManageDevelopment = (user) =>
  hasAnyPrivilege(user, ["ASSIGN_DEVELOPMENT", "ADMIN_ACCESS"]);

const ensureObjectId = (id, message) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(message);
  }
};

const buildDomainFilters = async (
  { fromDate, toDate, brandName, assignedDeveloperId, developmentStatus, hostingStatus, gscStatus },
  user
) => {
  const query = {};

  if (!canViewAllDevelopment(user)) {
    query.assignedDeveloperId = user._id;
  }

  if (brandName) {
    const normalizedBrandName = String(brandName).trim().toUpperCase();

    if (!normalizedBrandName) {
      throw new Error("Brand filter is invalid");
    }

    query.brandName = normalizedBrandName;
  }

  if (assignedDeveloperId) {
    ensureObjectId(assignedDeveloperId, "Assigned developer filter is invalid");
    query.assignedDeveloperId = assignedDeveloperId;
  }

  if (developmentStatus) {
    query.developmentStatus = developmentStatus;
  }

  if (hostingStatus) {
    query.hostingStatus = hostingStatus;
  }

  if (gscStatus) {
    query.gscStatus = gscStatus;
  }

  if (fromDate || toDate) {
    query.createdAt = {};

    if (fromDate) {
      const from = new Date(fromDate);
      if (Number.isNaN(from.getTime())) {
        throw new Error("From date is invalid");
      }
      query.createdAt.$gte = from;
    }

    if (toDate) {
      const to = new Date(toDate);
      if (Number.isNaN(to.getTime())) {
        throw new Error("To date is invalid");
      }
      to.setHours(23, 59, 59, 999);
      query.createdAt.$lte = to;
    }
  }

  return query;
};

const ensureBrandExists = async (brandName) => {
  const normalizedBrandName = String(brandName || "").trim().toUpperCase();

  if (!normalizedBrandName) {
    throw new Error("Brand name is required");
  }

  const brand = await Brand.findOne({ brandName: normalizedBrandName });

  if (!brand) {
    throw new Error("Brand not found");
  }

  return brand.brandName;
};

const ensureTemplateExists = async (templateId) => {
  if (!templateId) {
    return null;
  }

  ensureObjectId(templateId, "Template is invalid");
  const template = await DevelopmentTemplate.findById(templateId);

  if (!template) {
    throw new Error("Template not found");
  }

  return template;
};

const ensureAvailableArticlePoolArticle = async (articleId, brandName, excludeDomainId = null) => {
  if (!articleId) {
    return null;
  }

  ensureObjectId(articleId, "Content is invalid");

  const article = await ArticlePoolArticle.findById(articleId);

  if (!article) {
    throw new Error("Content not found");
  }

  if (extractBrandName(article.brandName) !== extractBrandName(brandName)) {
    throw new Error("Selected content does not belong to the selected brand");
  }

  const usageQuery = { articlePoolArticleId: article._id };
  if (excludeDomainId) {
    usageQuery._id = { $ne: excludeDomainId };
  }

  const existingUsage = await DevelopmentDomain.findOne(usageQuery).select("_id domain");
  if (existingUsage) {
    throw new Error("Selected content is already used for another development domain");
  }

  return article;
};

const ensureDeveloperCanBeAssigned = async (developerId) => {
  ensureObjectId(developerId, "Assigned developer is invalid");

  const developer = await User.findById(developerId).populate({
    path: "groupId",
    populate: { path: "privilegeIds" },
  });

  if (!developer) {
    throw new Error("Assigned developer not found");
  }

  if (developer.status !== "active") {
    throw new Error("Assigned developer must be active");
  }

  if (!getPrivilegeKeys(developer).includes(DEVELOPER_PRIVILEGE)) {
    throw new Error("Assigned user does not have development privilege");
  }

  return developer;
};

const ensureContentReadyForAssignment = ({ content, resources }) => {
  if (!normalizeText(content?.title)) {
    throw new Error("Content title must be added before assigning development");
  }

  if (!normalizeText(content?.description)) {
    throw new Error("Content description must be added before assigning development");
  }

  if (!normalizeText(content?.article)) {
    throw new Error("Content must be added before assigning development");
  }

  if (!Array.isArray(resources?.logos) || resources.logos.length === 0) {
    throw new Error("At least one logo must be added before assigning development");
  }

  if (!resources?.heroImage) {
    throw new Error("Hero image must be added before assigning development");
  }

  if (!resources?.favicon) {
    throw new Error("Favicon must be added before assigning development");
  }
};

const sanitizeDomainPayload = async (payload, { partial = false } = {}) => {
  const sanitized = {};

  if (!partial || payload.brandName !== undefined) {
    if (!payload.brandName) {
      throw new Error("Brand name is required");
    }

    sanitized.brandName = await ensureBrandExists(payload.brandName);
  }

  if (!partial || payload.domain !== undefined) {
    sanitized.domain = normalizeUrl(payload.domain, "Domain");
  }

  if (!partial || payload.landingPage !== undefined) {
    sanitized.landingPage = normalizeUrl(payload.landingPage, "Landing Page");
  }

  if (!partial || payload.termsAndConditionsPage !== undefined) {
    sanitized.termsAndConditionsPage = normalizeOptionalUrl(
      payload.termsAndConditionsPage,
      "Terms & Conditions Page"
    );
  }

  if (!partial || payload.aboutPage !== undefined) {
    sanitized.aboutPage = normalizeOptionalUrl(payload.aboutPage, "About Page");
  }

  if (!partial || payload.contactPage !== undefined) {
    sanitized.contactPage = normalizeOptionalUrl(payload.contactPage, "Contact Page");
  }

  if (payload.content !== undefined) {
    sanitized.content = normalizeContent(payload.content);
  }

  if (payload.resources !== undefined) {
    sanitized.resources = normalizeResources(payload.resources);
  }

  if (payload.templateId !== undefined) {
    const template = await ensureTemplateExists(payload.templateId);
    sanitized.templateId = template?._id || null;
  }

  if (payload.articlePoolArticleId !== undefined) {
    if (payload.articlePoolArticleId) {
      ensureObjectId(payload.articlePoolArticleId, "Content is invalid");
      sanitized.articlePoolArticleId = payload.articlePoolArticleId;
    } else {
      sanitized.articlePoolArticleId = null;
    }
  }

  return sanitized;
};

const ensureUniqueDomain = async (domain, excludeId = null) => {
  const query = { domain };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existingDomain = await DevelopmentDomain.findOne(query).select("_id");

  if (existingDomain) {
    throw new Error("Domain already exists in development");
  }
};

const sanitizeTemplatePayload = (payload) => {
  const name = normalizeText(payload.name);
  if (!name) {
    throw new Error("Info name is required");
  }

  return {
    name,
    notes: String(payload.notes || "").trim(),
  };
};

const ensureUniqueTemplate = async ({ name }, excludeId = null) => {
  const query = excludeId ? { _id: { $ne: excludeId } } : {};
  const templates = await DevelopmentTemplate.find(query).select("name");

  const nameConflict = templates.find(
    (item) => item.name.toLowerCase() === name.toLowerCase()
  );

  if (nameConflict) {
    throw new Error("Info name already exists");
  }
};

export const getDevelopmentDomainsService = async (filters, user) => {
  const query = await buildDomainFilters(filters, user);

  const domains = await DevelopmentDomain.find(query)
    .populate(populateDevelopmentDomain)
    .sort({ createdAt: -1 });

  const unlockedDomains = await Promise.all(
    domains.map((domain) => clearExpiredContentLock(domain))
  );

  return unlockedDomains.map((domain) => serializeDevelopmentDomain(domain));
};

export const getDevelopmentDomainByIdService = async (id, user) => {
  ensureObjectId(id, "Development item is invalid");

  const domain = await DevelopmentDomain.findById(id).populate(populateDevelopmentDomain);

  if (!domain) {
    throw new Error("Development item not found");
  }

  if (!canViewAllDevelopment(user) && String(domain.assignedDeveloperId?._id || "") !== String(user._id)) {
    throw new Error("You do not have permission to view this development item");
  }

  await clearExpiredContentLock(domain);

  return serializeDevelopmentDomain(domain);
};

export const createDevelopmentDomainService = async (payload, currentUserId) => {
  const sanitized = await sanitizeDomainPayload(payload);
  await ensureUniqueDomain(sanitized.domain);

  if (sanitized.articlePoolArticleId) {
    const article = await ensureAvailableArticlePoolArticle(
      sanitized.articlePoolArticleId,
      sanitized.brandName
    );
    sanitized.content = mapArticlePoolArticleToContent(article);
    sanitized.resources = normalizeResources(mapArticlePoolArticleToResources(article));
  }

  const domain = await DevelopmentDomain.create({
    ...sanitized,
    addedBy: currentUserId,
    ...(sanitized.content
      ? {
          contentUpdatedBy: currentUserId,
          contentUpdatedAt: new Date(),
        }
      : {}),
  });

  return serializeDevelopmentDomain(domain);
};

export const updateDevelopmentDomainService = async (id, payload, user = null) => {
  ensureObjectId(id, "Development item is invalid");

  const domain = await DevelopmentDomain.findById(id);

  if (!domain) {
    throw new Error("Development item not found");
  }

  const sanitized = await sanitizeDomainPayload(payload, { partial: true });

  if (sanitized.domain && sanitized.domain !== domain.domain) {
    await ensureUniqueDomain(sanitized.domain, id);
  }

  if (sanitized.articlePoolArticleId) {
    const brandName = sanitized.brandName || domain.brandName;
    const article = await ensureAvailableArticlePoolArticle(
      sanitized.articlePoolArticleId,
      brandName,
      id
    );
    sanitized.content = mapArticlePoolArticleToContent(article);
    sanitized.resources = normalizeResources(mapArticlePoolArticleToResources(article));
  } else if (sanitized.brandName && domain.articlePoolArticleId) {
    await ensureAvailableArticlePoolArticle(domain.articlePoolArticleId, sanitized.brandName, id);
  }

  Object.assign(domain, sanitized);
  if (sanitized.content && user?._id) {
    domain.contentUpdatedBy = user._id;
    domain.contentUpdatedAt = new Date();
  }
  await domain.save();

  const updatedDomain = await DevelopmentDomain.findById(domain._id).populate(populateDevelopmentDomain);
  return serializeDevelopmentDomain(updatedDomain);
};

export const acquireDevelopmentContentLockService = async (id, user) => {
  ensureObjectId(id, "Development item is invalid");

  const domain = await DevelopmentDomain.findById(id).populate(populateDevelopmentDomain);

  if (!domain) {
    throw new Error("Development item not found");
  }

  await clearExpiredContentLock(domain);

  const currentEditorId = String(domain.contentEditorId?._id || domain.contentEditorId || "");
  const requesterId = String(user._id);

  if (currentEditorId && currentEditorId !== requesterId) {
    throw new Error(`Content is currently being edited by ${domain.contentEditorId.fullName || "another user"}`);
  }

  domain.contentEditorId = user._id;
  domain.contentEditingAt = new Date();
  await domain.save();

  const lockedDomain = await DevelopmentDomain.findById(domain._id).populate(populateDevelopmentDomain);
  return serializeDevelopmentDomain(lockedDomain);
};

export const releaseDevelopmentContentLockService = async (id, user) => {
  ensureObjectId(id, "Development item is invalid");

  const domain = await DevelopmentDomain.findById(id).populate(populateDevelopmentDomain);

  if (!domain) {
    throw new Error("Development item not found");
  }

  await clearExpiredContentLock(domain);

  const currentEditorId = String(domain.contentEditorId?._id || domain.contentEditorId || "");
  const requesterId = String(user._id);

  if (currentEditorId && currentEditorId !== requesterId && !canManageDevelopment(user)) {
    throw new Error("You do not have permission to release this content lock");
  }

  domain.contentEditorId = null;
  domain.contentEditingAt = null;
  await domain.save();

  const unlockedDomain = await DevelopmentDomain.findById(domain._id).populate(populateDevelopmentDomain);
  return serializeDevelopmentDomain(unlockedDomain);
};

export const assignDevelopmentDomainService = async (id, { developerId }, currentUserId) => {
  ensureObjectId(id, "Development item is invalid");

  const domain = await DevelopmentDomain.findById(id);

  if (!domain) {
    throw new Error("Development item not found");
  }

  ensureContentReadyForAssignment(domain);
  await ensureDeveloperCanBeAssigned(developerId);

  domain.assignedDeveloperId = developerId;
  domain.assignedBy = currentUserId;
  domain.assignedAt = new Date();
  domain.progressPercent = calculateProgressPercent(domain);

  await domain.save();

  const assignedDomain = await DevelopmentDomain.findById(domain._id).populate(populateDevelopmentDomain);
  return serializeDevelopmentDomain(assignedDomain);
};

export const updateDevelopmentProgressService = async (id, payload, user) => {
  ensureObjectId(id, "Development item is invalid");

  const domain = await DevelopmentDomain.findById(id);

  if (!domain) {
    throw new Error("Development item not found");
  }

  const isAssignedDeveloper =
    String(domain.assignedDeveloperId || "") === String(user._id);

  if (!isAssignedDeveloper && !canManageDevelopment(user)) {
    throw new Error("You do not have permission to update this development item");
  }

  if (!domain.assignedDeveloperId) {
    throw new Error("Development item must be assigned before progress can be updated");
  }

  if (payload.templateId !== undefined) {
    const template = await ensureTemplateExists(payload.templateId);
    domain.templateId = template?._id || null;
  }

  if (payload.progressPercent !== undefined) {
    const progressPercent = Number(payload.progressPercent);

    if (!Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) {
      throw new Error("Progress percent must be an integer between 0 and 100");
    }

    domain.progressPercent = progressPercent;
  }

  if (payload.developmentStatus !== undefined) {
    if (!["new", "in-progress", "completed"].includes(payload.developmentStatus)) {
      throw new Error("Development status is invalid");
    }

    domain.developmentStatus = payload.developmentStatus;
  }

  if (payload.hostingStatus !== undefined) {
    if (!["not-hosted", "hosted"].includes(payload.hostingStatus)) {
      throw new Error("Hosting status is invalid");
    }

    domain.hostingStatus = payload.hostingStatus;
  }

  if (payload.gscStatus !== undefined) {
    if (!["not-done", "done"].includes(payload.gscStatus)) {
      throw new Error("GSC status is invalid");
    }

    domain.gscStatus = payload.gscStatus;
  }

  if (payload.content !== undefined) {
    domain.content = normalizeContent(payload.content);
  }

  if (payload.resources !== undefined) {
    domain.resources = normalizeResources(payload.resources);
  }

  domain.progressPercent = calculateProgressPercent(domain);

  await domain.save();

  const updatedDomain = await DevelopmentDomain.findById(domain._id).populate(populateDevelopmentDomain);
  return serializeDevelopmentDomain(updatedDomain);
};

export const deleteDevelopmentDomainService = async (id) => {
  ensureObjectId(id, "Development item is invalid");

  const domain = await DevelopmentDomain.findById(id);

  if (!domain) {
    throw new Error("Development item not found");
  }

  await domain.deleteOne();
};

export const getDevelopmentTemplatesService = async () => {
  return DevelopmentTemplate.find()
    .populate({ path: "createdBy", select: "fullName email" })
    .sort({ createdAt: -1 });
};

export const createDevelopmentTemplateService = async (payload, currentUserId) => {
  const sanitized = sanitizeTemplatePayload(payload);
  await ensureUniqueTemplate(sanitized);

  return DevelopmentTemplate.create({
    ...sanitized,
    createdBy: currentUserId,
  });
};

export const updateDevelopmentTemplateService = async (id, payload) => {
  ensureObjectId(id, "Info is invalid");

  const template = await DevelopmentTemplate.findById(id);

  if (!template) {
    throw new Error("Info not found");
  }

  const sanitized = sanitizeTemplatePayload(payload);
  await ensureUniqueTemplate(sanitized, id);

  Object.assign(template, sanitized);
  await template.save();

  return DevelopmentTemplate.findById(template._id).populate({
    path: "createdBy",
    select: "fullName email",
  });
};

export const deleteDevelopmentTemplateService = async (id) => {
  ensureObjectId(id, "Info is invalid");

  const template = await DevelopmentTemplate.findById(id);

  if (!template) {
    throw new Error("Info not found");
  }

  const assignedCount = await DevelopmentDomain.countDocuments({ templateId: id });

  if (assignedCount > 0) {
    throw new Error("Info is in use by development items");
  }

  await template.deleteOne();
};

export const getAssignableDevelopersService = async () => {
  const users = await User.find({ status: "active" }).populate({
    path: "groupId",
    populate: { path: "privilegeIds" },
  });

  return users
    .filter((user) => hasAnyPrivilege(user, [DEVELOPER_PRIVILEGE]))
    .map((user) => ({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      group: user.groupId
        ? {
            _id: user.groupId._id,
            name: user.groupId.name,
          }
        : null,
    }));
};

export { DEVELOPMENT_PRIVILEGES };
