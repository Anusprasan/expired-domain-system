import mongoose from "mongoose";
import Brand from "../brands/brand.model.js";
import User from "../users/user.model.js";
import DevelopmentDomain from "../development/developmentDomain.model.js";
import ArticlePoolArticle from "./articlePoolArticle.model.js";
import ArticlePoolTemplate from "./articlePoolTemplate.model.js";

export const ARTICLE_POOL_PRIVILEGES = [
  "READ_ARTICLE_POOL",
  "CREATE_ARTICLE_POOL",
  "EDIT_ARTICLE_POOL",
  "DELETE_ARTICLE_POOL",
  "IMPORT_ARTICLE_POOL",
  "EXPORT_ARTICLE_POOL",
  "ADMIN_ACCESS",
];

const ARTICLE_WRITER_PRIVILEGE = "DO_ARTICLE_POOL";
const CONTENT_LOCK_TIMEOUT_MS = 15 * 60 * 1000;
const BLOGGER_HOSTS = [
  "blogger.com",
  "blogspot.com",
  "blogger.googleusercontent.com",
  "googleusercontent.com",
];
const WRITING_STATUSES = ["new", "writing", "ready"];
const REVIEW_STATUSES = ["not-reviewed", "needs-revision", "approved"];
const PUBLICATION_STATUSES = ["not-published", "published"];
const ARTICLE_POOL_IMPORT_HEADER_MAP = {
  brand: "brandName",
  brandname: "brandName",
  "brand name": "brandName",
  title: "title",
  topic: "title",
  "content title": "title",
  description: "description",
  summary: "description",
  content: "content",
  article: "content",
  body: "content",
  note: "note",
  notes: "note",
  logo: "logo",
  logos: "logo",
  banner: "banner",
  "hero image": "banner",
  favicon: "favicon",
  button: "button",
  buttons: "button",
  gif: "button",
  gifs: "button",
  "created date": "createdDate",
  createddate: "createdDate",
  "created at": "createdDate",
  createdat: "createdDate",
  created_date: "createdDate",
  created_at: "createdDate",
  "created by": "createdBy",
  createdby: "createdBy",
  "created user": "createdBy",
  createduser: "createdBy",
  created_by: "createdBy",
  "added by": "createdBy",
  addedby: "createdBy",
  added_by: "createdBy",
};

const populateArticlePoolArticle = [
  { path: "templateId", select: "name notes" },
  { path: "addedBy", select: "fullName email" },
  { path: "assignedBy", select: "fullName email" },
  { path: "assignedWriterId", select: "fullName email status" },
  { path: "contentEditorId", select: "fullName email status" },
  { path: "contentUpdatedBy", select: "fullName email status" },
];

const normalizeText = (value) => String(value || "").trim().replace(/\s+/g, " ");

const getPlainText = (value) =>
  String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(.|\n)*?>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const getWordCount = (value) => {
  const text = getPlainText(value);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
};

const getPreviewText = (value, maxLength = 140) => {
  const text = getPlainText(value);

  if (!text || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
};

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

const ensureObjectId = (id, message) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(message);
  }
};

const normalizeOptionalUrl = (value, fieldName) => {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return "";
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

const normalizeUrlList = (value, fieldName) => {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value
    .map((item) => normalizeOptionalUrl(item, fieldName))
    .filter(Boolean);
};

const normalizeBloggerUrl = (value, fieldName) => {
  const normalized = normalizeOptionalUrl(value, fieldName);
  if (!normalized) {
    return "";
  }

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

  return value
    .map((item) => normalizeBloggerUrl(item, fieldName))
    .filter(Boolean);
};

const splitImportResourceList = (value) =>
  String(value || "")
    .split(/\r?\n|\|/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatArticlePoolCreatedByExport = (user) => {
  if (typeof user === "string" || user instanceof mongoose.Types.ObjectId) {
    return String(user);
  }

  const fullName = String(user?.fullName || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();

  if (fullName && email) {
    return `${fullName} <${email}>`;
  }

  if (fullName || email) {
    return fullName || email;
  }

  return user?._id ? String(user._id) : "";
};

const extractEmailAddress = (value) => {
  const match = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : "";
};

const parseImportedCreatedDate = (value) => {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return null;
  }

  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Created Date is invalid");
  }

  return parsedDate;
};

const buildImportUserLookup = (users = []) => {
  const byId = new Map();
  const byEmail = new Map();
  const byName = new Map();
  const ambiguousNames = new Set();

  users.forEach((user) => {
    const userId = String(user._id);
    const email = String(user.email || "").trim().toLowerCase();
    const normalizedName = normalizeText(user.fullName).toLowerCase();

    byId.set(userId, user);

    if (email) {
      byEmail.set(email, user);
    }

    if (!normalizedName || ambiguousNames.has(normalizedName)) {
      return;
    }

    if (byName.has(normalizedName)) {
      byName.delete(normalizedName);
      ambiguousNames.add(normalizedName);
      return;
    }

    byName.set(normalizedName, user);
  });

  return {
    byId,
    byEmail,
    byName,
    ambiguousNames,
  };
};

const resolveImportedCreatedByUser = (value, userLookup) => {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return null;
  }

  if (mongoose.Types.ObjectId.isValid(rawValue)) {
    const matchedById = userLookup.byId.get(rawValue);

    if (matchedById) {
      return matchedById;
    }
  }

  const email = extractEmailAddress(rawValue);
  if (email) {
    const matchedByEmail = userLookup.byEmail.get(email);

    if (matchedByEmail) {
      return matchedByEmail;
    }
  }

  const normalizedName = normalizeText(rawValue).toLowerCase();

  if (normalizedName) {
    if (userLookup.ambiguousNames.has(normalizedName)) {
      throw new Error("Created By matches multiple users. Use an email address instead");
    }

    const matchedByName = userLookup.byName.get(normalizedName);

    if (matchedByName) {
      return matchedByName;
    }
  }

  throw new Error("Created By user not found");
};

const areDatesEqual = (left, right) => {
  const leftDate = left ? new Date(left) : null;
  const rightDate = right ? new Date(right) : null;

  if (!leftDate || !rightDate) {
    return false;
  }

  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return false;
  }

  return leftDate.getTime() === rightDate.getTime();
};

const normalizeContent = (content = {}) => {
  if (typeof content !== "object" || Array.isArray(content) || content === null) {
    throw new Error("Content is invalid");
  }

  return {
    title: String(content.title || "").trim(),
    summary: String(content.summary || content.description || "").trim(),
    body: String(content.body || content.article || "").trim(),
    note: String(content.note || "").trim(),
  };
};

const validateRequiredArticleContent = (content) => {
  if (!content.title) {
    throw new Error("Content title is required");
  }

  if (!content.summary) {
    throw new Error("Content description is required");
  }

  if (!getPlainText(content.body)) {
    throw new Error("Content body is required");
  }
};

const normalizeResources = (resources = {}) => {
  if (typeof resources !== "object" || Array.isArray(resources) || resources === null) {
    throw new Error("Resources are invalid");
  }

  return {
    referenceLinks: normalizeUrlList(resources.referenceLinks || [], "Reference links"),
    imageLinks: normalizeUrlList(resources.imageLinks || [], "Image links"),
    logos: normalizeBloggerUrlList(resources.logos || [], "Logo"),
    gifs: normalizeBloggerUrlList(resources.gifs || [], "Button"),
    heroImage: resources.heroImage
      ? normalizeBloggerUrl(resources.heroImage, "Banner")
      : "",
    favicon: resources.favicon
      ? normalizeBloggerUrl(resources.favicon, "Favicon")
      : "",
  };
};

const buildResourceSummary = (resources = {}) => ({
  logoCount: Array.isArray(resources.logos) ? resources.logos.filter(Boolean).length : 0,
  hasBanner: Boolean(String(resources.heroImage || "").trim()),
  hasFavicon: Boolean(String(resources.favicon || "").trim()),
  buttonCount: Array.isArray(resources.gifs) ? resources.gifs.filter(Boolean).length : 0,
});

const escapeCsvCell = (value) => {
  const stringValue = String(value ?? "");

  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }

  return stringValue;
};

const normalizeImportExistingStrategy = (value) =>
  String(value || "").trim().toLowerCase() === "update" ? "update" : "skip";

const buildArticleImportKey = (brandName, title) =>
  `${String(brandName || "").trim().toUpperCase()}::${normalizeText(title).toLowerCase()}`;

const areStringArraysEqual = (left = [], right = []) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
};

const parseCsvText = (csvText) => {
  const normalizedText = String(csvText || "").replace(/^\uFEFF/, "");
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const nextChar = normalizedText[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      if (currentRow.some((value) => String(value || "").trim())) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length || currentRow.length) {
    currentRow.push(currentCell);
    if (currentRow.some((value) => String(value || "").trim())) {
      rows.push(currentRow);
    }
  }

  return rows;
};

const mapArticlePoolCsvHeaders = (headerCells = []) =>
  headerCells.map((header) => {
    const normalizedHeader = normalizeText(header).toLowerCase();
    return ARTICLE_POOL_IMPORT_HEADER_MAP[normalizedHeader] || "";
  });

const parseArticlePoolCsv = (csvText) => {
  const rows = parseCsvText(csvText);

  if (!rows.length) {
    return {
      rows: [],
      hasHeaderRow: false,
    };
  }

  const mappedHeaders = mapArticlePoolCsvHeaders(rows[0]);
  const hasHeaderRow = mappedHeaders.some(Boolean);
  const dataRows = hasHeaderRow ? rows.slice(1) : rows;

  return {
    hasHeaderRow,
    rows: dataRows.map((cells, index) => {
      if (hasHeaderRow) {
        return mappedHeaders.reduce(
          (result, headerKey, headerIndex) => {
            if (headerKey) {
              result[headerKey] = cells[headerIndex] || "";
            }

            return result;
          },
          { __rowNumber: index + 2 }
        );
      }

      return {
        brandName: cells[0] || "",
        title: cells[1] || "",
        description: cells[2] || "",
        content: cells[3] || "",
        note: cells[4] || "",
        logo: cells[5] || "",
        banner: cells[6] || "",
        favicon: cells[7] || "",
        button: cells[8] || "",
        createdDate: cells[9] || "",
        createdBy: cells[10] || "",
        __rowNumber: index + 1,
      };
    }),
  };
};

const buildArticlePoolImportChange = (field, label) => ({
  field,
  label,
});

const buildArticlePoolCsvRowMessage = ({ status, action, changes, allowUpdates }) => {
  if (status === "invalid") {
    return "Row has validation errors";
  }

  if (status === "new") {
    return "New content will be imported";
  }

  if (status === "unchanged") {
    return "Existing content already matches current data";
  }

  const changedLabels = changes.map((change) => change.label).join(", ");

  if (action === "update") {
    return `Existing content will update: ${changedLabels}`;
  }

  if (!allowUpdates) {
    return `Change detected (${changedLabels}) but update requires Update Content Pool privilege`;
  }

  return `Change detected (${changedLabels}) and will be skipped`;
};

const buildArticlePoolCsvPreviewSummary = (rows = []) => {
  const summary = {
    totalRows: rows.length,
    newCount: 0,
    updateCount: 0,
    changedCount: 0,
    unchangedCount: 0,
    skippedCount: 0,
    invalidCount: 0,
    actionableCount: 0,
  };

  rows.forEach((row) => {
    if (row.status === "invalid") {
      summary.invalidCount += 1;
      return;
    }

    if (row.status === "new") {
      summary.newCount += 1;
    }

    if (row.status === "changed") {
      summary.changedCount += 1;
    }

    if (row.status === "unchanged") {
      summary.unchangedCount += 1;
    }

    if (row.action === "create" || row.action === "update") {
      summary.actionableCount += 1;
    } else {
      summary.skippedCount += 1;
    }

    if (row.action === "update") {
      summary.updateCount += 1;
    }
  });

  return summary;
};

const serializeArticlePoolCsvPreviewRow = (row) => ({
  rowNumber: row.rowNumber,
  brandName: row.brandName,
  title: row.title,
  description: row.description,
  note: row.note,
  contentPreview: row.contentPreview,
  contentWordCount: row.contentWordCount,
  resources: row.resources,
  status: row.status,
  action: row.action,
  willImport: row.willImport,
  message: row.message,
  errors: row.errors,
  changes: row.changes,
  existing: row.existing,
});

const calculateProgressPercent = (article) => {
  const content = article?.content || {};
  if (content.title?.trim() && content.summary?.trim() && getPlainText(content.body)) {
    return 100;
  }

  let progress = 0;

  if (article.writingStatus === "ready") {
    progress += 50;
  } else if (article.writingStatus === "writing") {
    progress += 20;
  }

  if (article.reviewStatus === "approved") {
    progress += 30;
  } else if (article.reviewStatus === "needs-revision") {
    progress += 10;
  }

  if (article.publicationStatus === "published") {
    progress += 20;
  }

  return Math.min(progress, 100);
};

const serializeArticlePoolArticle = (article) => {
  const serialized = typeof article.toObject === "function" ? article.toObject() : { ...article };

  return {
    ...serialized,
    brandName: extractBrandName(serialized.brandName),
    progressPercent: calculateProgressPercent(serialized),
  };
};

const getPrivilegeKeys = (user) =>
  user?.groupId?.privilegeIds?.map((privilege) => privilege.key) || [];

const hasAnyPrivilege = (user, privilegeKeys) => {
  const groupName = user?.groupId?.name?.toLowerCase();
  if (groupName === "admin") {
    return true;
  }

  const userPrivilegeKeys = getPrivilegeKeys(user);
  return privilegeKeys.some((privilegeKey) => userPrivilegeKeys.includes(privilegeKey));
};

const canViewAllArticlePool = (user) =>
  hasAnyPrivilege(user, ARTICLE_POOL_PRIVILEGES);

const isAdminUser = (user) =>
  user?.groupId?.name?.toLowerCase() === "admin" || getPrivilegeKeys(user).includes("ADMIN_ACCESS");

const canManageArticlePool = (user) => isAdminUser(user);

const isContentLockExpired = (article) => {
  if (!article?.contentEditorId || !article?.contentEditingAt) {
    return false;
  }

  const lockStartedAt = new Date(article.contentEditingAt);

  if (Number.isNaN(lockStartedAt.getTime())) {
    return true;
  }

  return Date.now() - lockStartedAt.getTime() > CONTENT_LOCK_TIMEOUT_MS;
};

const clearExpiredContentLock = async (article) => {
  if (!isContentLockExpired(article)) {
    return article;
  }

  article.contentEditorId = null;
  article.contentEditingAt = null;
  await article.save();
  return article;
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

  ensureObjectId(templateId, "Info is invalid");
  const template = await ArticlePoolTemplate.findById(templateId);

  if (!template) {
    throw new Error("Info not found");
  }

  return template;
};

const ensureWriterCanBeAssigned = async (writerId) => {
  ensureObjectId(writerId, "Assigned writer is invalid");

  const writer = await User.findById(writerId).populate({
    path: "groupId",
    populate: { path: "privilegeIds" },
  });

  if (!writer) {
    throw new Error("Assigned writer not found");
  }

  if (writer.status !== "active") {
    throw new Error("Assigned writer must be active");
  }

  if (!getPrivilegeKeys(writer).includes(ARTICLE_WRITER_PRIVILEGE)) {
    throw new Error("Assigned user does not have content pool writing privilege");
  }

  return writer;
};

const sanitizeArticlePayload = async (payload, { partial = false } = {}) => {
  const sanitized = {};
  const hasInlineContent =
    payload.title !== undefined
    || payload.description !== undefined
    || payload.article !== undefined;
  const contentPayload = payload.content !== undefined
    ? payload.content
    : hasInlineContent
      ? {
          title: payload.title,
          summary: payload.description,
          body: payload.article,
        }
      : undefined;

  if (!partial || payload.brandName !== undefined) {
    sanitized.brandName = await ensureBrandExists(payload.brandName);
  }

  if (contentPayload !== undefined) {
    sanitized.content = normalizeContent(contentPayload);
    validateRequiredArticleContent(sanitized.content);
  } else if (!partial) {
    sanitized.content = normalizeContent({});
    validateRequiredArticleContent(sanitized.content);
  }

  if (
    !partial
    || payload.topic !== undefined
    || payload.title !== undefined
    || payload.content?.title !== undefined
  ) {
    const topic = normalizeText(payload.topic || payload.title || payload.content?.title || sanitized.content?.title);
    if (!topic) {
      throw new Error("Content title is required");
    }
    sanitized.topic = topic;
  }

  if (payload.targetKeyword !== undefined) {
    sanitized.targetKeyword = normalizeText(payload.targetKeyword);
  } else if (!partial) {
    sanitized.targetKeyword = "";
  }

  if (payload.targetUrl !== undefined) {
    sanitized.targetUrl = normalizeOptionalUrl(payload.targetUrl, "Target URL");
  } else if (!partial) {
    sanitized.targetUrl = "";
  }

  if (payload.articleUrl !== undefined) {
    sanitized.articleUrl = normalizeOptionalUrl(payload.articleUrl, "Article URL");
  } else if (!partial) {
    sanitized.articleUrl = "";
  }

  if (payload.resources !== undefined) {
    sanitized.resources = normalizeResources(payload.resources);
  }

  if (payload.templateId !== undefined) {
    const template = await ensureTemplateExists(payload.templateId);
    sanitized.templateId = template?._id || null;
  }

  return sanitized;
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

const ensureUniqueArticle = async ({ brandName, topic }, excludeId = null) => {
  const query = {
    brandName,
    topic: { $regex: `^${topic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existingArticle = await ArticlePoolArticle.findOne(query).select("_id");

  if (existingArticle) {
    throw new Error("Content already exists in this brand pool");
  }
};

const ensureUniqueTemplate = async ({ name }, excludeId = null) => {
  const query = excludeId ? { _id: { $ne: excludeId } } : {};
  const templates = await ArticlePoolTemplate.find(query).select("name");

  const nameConflict = templates.find(
    (item) => item.name.toLowerCase() === name.toLowerCase()
  );

  if (nameConflict) {
    throw new Error("Info name already exists");
  }
};

const shouldFilterAvailableDevelopmentArticles = (value) =>
  value === true || ["true", "1", "yes"].includes(String(value || "").toLowerCase());

const buildArticleFilters = async (
  {
    fromDate,
    toDate,
    brandName,
    assignedWriterId,
    writingStatus,
    reviewStatus,
    publicationStatus,
    availableForDevelopment,
  },
  user
) => {
  const query = {};

  if (!canViewAllArticlePool(user)) {
    query.assignedWriterId = user._id;
  }

  if (brandName) {
    query.brandName = String(brandName).trim().toUpperCase();
  }

  if (assignedWriterId) {
    ensureObjectId(assignedWriterId, "Assigned writer filter is invalid");
    query.assignedWriterId = assignedWriterId;
  }

  if (writingStatus) {
    query.writingStatus = writingStatus;
  }

  if (reviewStatus) {
    query.reviewStatus = reviewStatus;
  }

  if (publicationStatus) {
    query.publicationStatus = publicationStatus;
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

  if (shouldFilterAvailableDevelopmentArticles(availableForDevelopment)) {
    const usedArticleIds = await DevelopmentDomain.distinct("articlePoolArticleId", {
      articlePoolArticleId: { $type: "objectId" },
    });

    if (usedArticleIds.length) {
      query._id = { $nin: usedArticleIds };
    }
  }

  return query;
};

const buildArticlePoolCsvImportPlan = async ({
  csvText,
  existingStrategy,
  allowUpdates = false,
} = {}) => {
  const parsedCsv = parseArticlePoolCsv(csvText);
  const rows = parsedCsv.rows;

  if (!rows.length) {
    throw new Error("CSV content is required");
  }

  const [brands, users, existingArticles] = await Promise.all([
    Brand.find().select("brandName").lean(),
    User.find().select("fullName email").lean(),
    ArticlePoolArticle.find()
      .select("brandName topic content resources addedBy createdAt")
      .lean(),
  ]);
  const brandMap = new Map(
    brands.map((brand) => [normalizeText(brand.brandName).toLowerCase(), brand.brandName])
  );
  const importUserLookup = buildImportUserLookup(users);
  const existingArticleByKey = new Map(
    existingArticles.map((article) => [
      buildArticleImportKey(article.brandName, article.topic || article.content?.title || ""),
      article,
    ])
  );
  const seenKeys = new Set();
  const normalizedStrategy = normalizeImportExistingStrategy(existingStrategy);

  const planRows = rows.map((row) => {
    const rowNumber = row.__rowNumber;
    const errors = [];
    const brandInput = normalizeText(row.brandName);
    const resolvedBrandName = brandInput
      ? brandMap.get(brandInput.toLowerCase())
      : "";
    const title = String(row.title || "").trim();
    const description = String(row.description || "").trim();
    const contentBody = String(row.content || "").trim();
    const note = String(row.note || "").trim();
    const createdDateInput = String(row.createdDate || "").trim();
    const createdByInput = String(row.createdBy || "").trim();
    const topic = normalizeText(title);
    const contentWordCount = getWordCount(contentBody);
    const contentPreview = getPreviewText(contentBody);
    const resourceInput = {
      logos: splitImportResourceList(row.logo),
      heroImage: String(row.banner || "").trim(),
      favicon: String(row.favicon || "").trim(),
      gifs: splitImportResourceList(row.button),
    };
    let content = null;
    let resources = null;
    let importedCreatedAt = null;
    let importedCreatedBy = null;
    let importedCreatedById = null;

    if (!brandInput) {
      errors.push("Brand name is required");
    } else if (!resolvedBrandName) {
      errors.push("Brand not found");
    }

    try {
      content = normalizeContent({
        title,
        summary: description,
        body: contentBody,
        note,
      });
      validateRequiredArticleContent(content);
    } catch (error) {
      errors.push(error.message);
    }

    try {
      resources = normalizeResources({
        referenceLinks: [],
        imageLinks: [],
        logos: resourceInput.logos,
        heroImage: resourceInput.heroImage,
        favicon: resourceInput.favicon,
        gifs: resourceInput.gifs,
      });
    } catch (error) {
      errors.push(error.message);
    }

    try {
      importedCreatedAt = parseImportedCreatedDate(createdDateInput);
    } catch (error) {
      errors.push(error.message);
    }

    try {
      importedCreatedBy = resolveImportedCreatedByUser(createdByInput, importUserLookup);
      importedCreatedById = importedCreatedBy ? String(importedCreatedBy._id) : null;
    } catch (error) {
      errors.push(error.message);
    }

    const importKey = resolvedBrandName && topic
      ? buildArticleImportKey(resolvedBrandName, topic)
      : "";

    if (importKey) {
      if (seenKeys.has(importKey)) {
        errors.push("Duplicate content inside this upload");
      } else {
        seenKeys.add(importKey);
      }
    }

    const incomingResources = resources || {
      logos: resourceInput.logos,
      heroImage: resourceInput.heroImage,
      favicon: resourceInput.favicon,
      gifs: resourceInput.gifs,
    };
    const incomingResourceSummary = buildResourceSummary(incomingResources);

    if (errors.length) {
      return {
        rowNumber,
        brandName: resolvedBrandName || brandInput || "-",
        title,
        description,
        note,
        contentPreview,
        contentWordCount,
        resources: incomingResourceSummary,
        status: "invalid",
        action: "invalid",
        willImport: false,
        message: "Row has validation errors",
        errors,
        changes: [],
        existing: null,
        topic,
        content,
        resourcesPayload: resources,
        importedCreatedAt,
        importedCreatedById,
        existingArticleId: null,
      };
    }

    const existingArticle = existingArticleByKey.get(importKey);

    if (!existingArticle) {
      return {
        rowNumber,
        brandName: resolvedBrandName,
        title: content.title,
        description: content.summary,
        note: content.note,
        contentPreview,
        contentWordCount,
        resources: incomingResourceSummary,
        status: "new",
        action: "create",
        willImport: true,
        message: "New content will be imported",
        errors: [],
        changes: [],
        existing: null,
        topic,
        content,
        resourcesPayload: resources,
        importedCreatedAt,
        importedCreatedById,
        existingArticleId: null,
      };
    }

    const existingTitle = String(existingArticle.content?.title || existingArticle.topic || "").trim();
    const existingDescription = String(existingArticle.content?.summary || "").trim();
    const existingBody = String(existingArticle.content?.body || "").trim();
    const existingNote = String(existingArticle.content?.note || "").trim();
    const existingResources = existingArticle.resources || {};
    const changes = [];

    if (existingTitle !== content.title) {
      changes.push(buildArticlePoolImportChange("title", "Title"));
    }

    if (existingDescription !== content.summary) {
      changes.push(buildArticlePoolImportChange("description", "Description"));
    }

    if (existingBody !== content.body) {
      changes.push(buildArticlePoolImportChange("content", "Content"));
    }

    if (existingNote !== content.note) {
      changes.push(buildArticlePoolImportChange("note", "Note"));
    }

    if (!areStringArraysEqual(existingResources.logos || [], resources.logos)) {
      changes.push(buildArticlePoolImportChange("logo", "Logo"));
    }

    if (String(existingResources.heroImage || "") !== resources.heroImage) {
      changes.push(buildArticlePoolImportChange("banner", "Banner"));
    }

    if (String(existingResources.favicon || "") !== resources.favicon) {
      changes.push(buildArticlePoolImportChange("favicon", "Favicon"));
    }

    if (!areStringArraysEqual(existingResources.gifs || [], resources.gifs)) {
      changes.push(buildArticlePoolImportChange("button", "Button"));
    }

    if (importedCreatedAt && !areDatesEqual(existingArticle.createdAt, importedCreatedAt)) {
      changes.push(buildArticlePoolImportChange("createdDate", "Created Date"));
    }

    if (importedCreatedById && String(existingArticle.addedBy || "") !== importedCreatedById) {
      changes.push(buildArticlePoolImportChange("createdBy", "Created By"));
    }

    const existingResourceSummary = buildResourceSummary(existingResources);
    const existingPreview = {
      id: String(existingArticle._id),
      brandName: existingArticle.brandName,
      title: existingTitle,
      description: existingDescription,
      note: existingNote,
      contentPreview: getPreviewText(existingBody),
      contentWordCount: getWordCount(existingBody),
      resources: existingResourceSummary,
    };

    if (!changes.length) {
      return {
        rowNumber,
        brandName: resolvedBrandName,
        title: content.title,
        description: content.summary,
        note: content.note,
        contentPreview,
        contentWordCount,
        resources: incomingResourceSummary,
        status: "unchanged",
        action: "skip",
        willImport: false,
        message: "Existing content already matches current data",
        errors: [],
        changes: [],
        existing: existingPreview,
        topic,
        content,
        resourcesPayload: resources,
        importedCreatedAt,
        importedCreatedById,
        existingArticleId: String(existingArticle._id),
      };
    }

    const shouldUpdate = normalizedStrategy === "update" && allowUpdates;

    return {
      rowNumber,
      brandName: resolvedBrandName,
      title: content.title,
      description: content.summary,
      note: content.note,
      contentPreview,
      contentWordCount,
      resources: incomingResourceSummary,
      status: "changed",
      action: shouldUpdate ? "update" : "skip",
      willImport: shouldUpdate,
      message: buildArticlePoolCsvRowMessage({
        status: "changed",
        action: shouldUpdate ? "update" : "skip",
        changes,
        allowUpdates,
      }),
      errors: [],
      changes,
      existing: existingPreview,
      topic,
      content,
      resourcesPayload: resources,
      importedCreatedAt,
      importedCreatedById,
      existingArticleId: String(existingArticle._id),
    };
  });

  return {
    hasHeaderRow: parsedCsv.hasHeaderRow,
    existingStrategy: normalizedStrategy,
    canUpdateExisting: allowUpdates,
    rows: planRows,
    summary: buildArticlePoolCsvPreviewSummary(planRows),
  };
};

export const getArticlePoolArticlesService = async (filters, user) => {
  const query = await buildArticleFilters(filters, user);

  const articles = await ArticlePoolArticle.find(query)
    .populate(populateArticlePoolArticle)
    .sort({ createdAt: -1 });

  const unlockedArticles = await Promise.all(
    articles.map((article) => clearExpiredContentLock(article))
  );

  return unlockedArticles.map((article) => serializeArticlePoolArticle(article));
};

export const getArticlePoolArticleByIdService = async (id, user) => {
  ensureObjectId(id, "Content is invalid");

  const article = await ArticlePoolArticle.findById(id).populate(populateArticlePoolArticle);

  if (!article) {
    throw new Error("Content not found");
  }

  if (!canViewAllArticlePool(user) && String(article.assignedWriterId?._id || "") !== String(user._id)) {
    throw new Error("You do not have permission to view this content");
  }

  await clearExpiredContentLock(article);

  return serializeArticlePoolArticle(article);
};

export const previewArticlePoolCsvImportService = async ({
  csvText,
  existingStrategy,
  allowUpdates = false,
} = {}) => {
  const plan = await buildArticlePoolCsvImportPlan({
    csvText,
    existingStrategy,
    allowUpdates,
  });

  return {
    hasHeaderRow: plan.hasHeaderRow,
    existingStrategy: plan.existingStrategy,
    canUpdateExisting: plan.canUpdateExisting,
    summary: plan.summary,
    rows: plan.rows.map((row) => serializeArticlePoolCsvPreviewRow(row)),
  };
};

export const importArticlePoolCsvService = async ({
  userId,
  csvText,
  existingStrategy,
  allowUpdates = false,
} = {}) => {
  if (!userId) {
    throw new Error("User is required for content pool import");
  }

  const plan = await buildArticlePoolCsvImportPlan({
    csvText,
    existingStrategy,
    allowUpdates,
  });

  if (!plan.summary.actionableCount) {
    throw new Error("No valid rows are ready to import");
  }

  const rowsToCreate = plan.rows.filter((row) => row.action === "create");
  const rowsToUpdate = plan.rows.filter((row) => row.action === "update");
  const skippedRows = plan.rows
    .filter((row) => !row.willImport)
    .map((row) => ({
      rowNumber: row.rowNumber,
      brandName: row.brandName,
      title: row.title,
      error: row.errors.length ? row.errors.join(" | ") : row.message,
    }));

  if (rowsToCreate.length) {
    await ArticlePoolArticle.insertMany(
      rowsToCreate.map((row) => {
        const payload = {
          brandName: row.brandName,
          topic: row.topic,
          content: row.content,
          resources: row.resourcesPayload,
          addedBy: row.importedCreatedById || userId,
        };

        if (row.importedCreatedAt) {
          payload.createdAt = row.importedCreatedAt;
          payload.updatedAt = row.importedCreatedAt;
        }

        return payload;
      })
    );
  }

  if (rowsToUpdate.length) {
    await Promise.all(
      rowsToUpdate.map((row) => {
        const updatePayload = {
          brandName: row.brandName,
          topic: row.topic,
          content: row.content,
          resources: row.resourcesPayload,
          contentUpdatedBy: userId,
          contentUpdatedAt: new Date(),
        };

        if (row.importedCreatedAt) {
          updatePayload.createdAt = row.importedCreatedAt;
        }

        if (row.importedCreatedById) {
          updatePayload.addedBy = row.importedCreatedById;
        }

        return ArticlePoolArticle.updateOne(
          { _id: row.existingArticleId },
          { $set: updatePayload },
          { overwriteImmutable: Boolean(row.importedCreatedAt) }
        );
      })
    );
  }

  return {
    createdCount: rowsToCreate.length,
    updatedCount: rowsToUpdate.length,
    skippedCount: skippedRows.length,
    invalidCount: plan.summary.invalidCount,
    unchangedCount: plan.summary.unchangedCount,
    changedCount: plan.summary.changedCount,
    existingStrategy: plan.existingStrategy,
    skippedRows,
  };
};

export const exportArticlePoolCsvService = async (user) => {
  const query = await buildArticleFilters({}, user);
  const articles = await ArticlePoolArticle.find(query)
    .populate({ path: "addedBy", select: "fullName email" })
    .sort({ brandName: 1, topic: 1, createdAt: -1 })
    .lean();
  const headers = [
    "Created Date",
    "Brand",
    "Title",
    "Description",
    "Content",
    "Note",
    "Logo",
    "Banner",
    "Favicon",
    "Button",
    "Created By",
  ];
  const rows = articles.map((article) => {
    const content = article.content || {};
    const resources = article.resources || {};

    return [
      article.createdAt ? new Date(article.createdAt).toISOString() : "",
      article.brandName || "",
      content.title || article.topic || "",
      content.summary || "",
      content.body || "",
      content.note || "",
      Array.isArray(resources.logos) ? resources.logos.join("\n") : "",
      resources.heroImage || "",
      resources.favicon || "",
      Array.isArray(resources.gifs) ? resources.gifs.join("\n") : "",
      formatArticlePoolCreatedByExport(article.addedBy),
    ]
      .map((value) => escapeCsvCell(value))
      .join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
};

export const createArticlePoolArticleService = async (payload, currentUserId) => {
  const sanitized = await sanitizeArticlePayload(payload);
  await ensureUniqueArticle(sanitized);

  const article = await ArticlePoolArticle.create({
    ...sanitized,
    addedBy: currentUserId,
  });

  return serializeArticlePoolArticle(article);
};

export const updateArticlePoolArticleService = async (id, payload, user = null) => {
  ensureObjectId(id, "Content is invalid");

  const article = await ArticlePoolArticle.findById(id);

  if (!article) {
    throw new Error("Content not found");
  }

  const sanitized = await sanitizeArticlePayload(payload, { partial: true });

  if (
    (sanitized.brandName && sanitized.brandName !== article.brandName)
    || (sanitized.topic && sanitized.topic.toLowerCase() !== article.topic.toLowerCase())
  ) {
    await ensureUniqueArticle(
      {
        brandName: sanitized.brandName || article.brandName,
        topic: sanitized.topic || article.topic,
      },
      id
    );
  }

  Object.assign(article, sanitized);
  if (sanitized.content && user?._id) {
    article.contentUpdatedBy = user._id;
    article.contentUpdatedAt = new Date();
  }
  await article.save();

  const updatedArticle = await ArticlePoolArticle.findById(article._id).populate(populateArticlePoolArticle);
  return serializeArticlePoolArticle(updatedArticle);
};

export const assignArticlePoolArticleService = async (id, { writerId }, currentUserId) => {
  ensureObjectId(id, "Content is invalid");

  const article = await ArticlePoolArticle.findById(id);

  if (!article) {
    throw new Error("Content not found");
  }

  await ensureWriterCanBeAssigned(writerId);

  article.assignedWriterId = writerId;
  article.assignedBy = currentUserId;
  article.assignedAt = new Date();
  article.progressPercent = calculateProgressPercent(article);

  await article.save();

  const assignedArticle = await ArticlePoolArticle.findById(article._id).populate(populateArticlePoolArticle);
  return serializeArticlePoolArticle(assignedArticle);
};

export const acquireArticlePoolContentLockService = async (id, user) => {
  ensureObjectId(id, "Content is invalid");

  const article = await ArticlePoolArticle.findById(id).populate(populateArticlePoolArticle);

  if (!article) {
    throw new Error("Content not found");
  }

  await clearExpiredContentLock(article);

  const currentEditorId = String(article.contentEditorId?._id || article.contentEditorId || "");
  const requesterId = String(user._id);

  if (currentEditorId && currentEditorId !== requesterId) {
    throw new Error(`Content is currently being edited by ${article.contentEditorId.fullName || "another user"}`);
  }

  article.contentEditorId = user._id;
  article.contentEditingAt = new Date();
  await article.save();

  const lockedArticle = await ArticlePoolArticle.findById(article._id).populate(populateArticlePoolArticle);
  return serializeArticlePoolArticle(lockedArticle);
};

export const releaseArticlePoolContentLockService = async (id, user) => {
  ensureObjectId(id, "Content is invalid");

  const article = await ArticlePoolArticle.findById(id).populate(populateArticlePoolArticle);

  if (!article) {
    throw new Error("Content not found");
  }

  await clearExpiredContentLock(article);

  const currentEditorId = String(article.contentEditorId?._id || article.contentEditorId || "");
  const requesterId = String(user._id);

  if (currentEditorId && currentEditorId !== requesterId && !canManageArticlePool(user)) {
    throw new Error("You do not have permission to release this content lock");
  }

  article.contentEditorId = null;
  article.contentEditingAt = null;
  await article.save();

  const unlockedArticle = await ArticlePoolArticle.findById(article._id).populate(populateArticlePoolArticle);
  return serializeArticlePoolArticle(unlockedArticle);
};

export const updateArticlePoolProgressService = async (id, payload, user) => {
  ensureObjectId(id, "Content is invalid");

  const article = await ArticlePoolArticle.findById(id);

  if (!article) {
    throw new Error("Content not found");
  }

  const isAssignedWriter = String(article.assignedWriterId || "") === String(user._id);

  if (!isAssignedWriter && !canManageArticlePool(user)) {
    throw new Error("You do not have permission to update this content");
  }

  if (payload.templateId !== undefined) {
    const template = await ensureTemplateExists(payload.templateId);
    article.templateId = template?._id || null;
  }

  if (payload.writingStatus !== undefined) {
    if (!WRITING_STATUSES.includes(payload.writingStatus)) {
      throw new Error("Writing status is invalid");
    }

    article.writingStatus = payload.writingStatus;
  }

  if (payload.reviewStatus !== undefined) {
    if (!REVIEW_STATUSES.includes(payload.reviewStatus)) {
      throw new Error("Review status is invalid");
    }

    article.reviewStatus = payload.reviewStatus;
  }

  if (payload.publicationStatus !== undefined) {
    if (!PUBLICATION_STATUSES.includes(payload.publicationStatus)) {
      throw new Error("Publication status is invalid");
    }

    article.publicationStatus = payload.publicationStatus;
  }

  if (payload.articleUrl !== undefined) {
    article.articleUrl = normalizeOptionalUrl(payload.articleUrl, "Article URL");
  }

  if (payload.content !== undefined) {
    const content = normalizeContent(payload.content);
    validateRequiredArticleContent(content);
    article.content = content;
    article.contentUpdatedBy = user._id;
    article.contentUpdatedAt = new Date();
  }

  if (payload.resources !== undefined) {
    article.resources = normalizeResources(payload.resources);
  }

  article.progressPercent = calculateProgressPercent(article);

  await article.save();

  const updatedArticle = await ArticlePoolArticle.findById(article._id).populate(populateArticlePoolArticle);
  return serializeArticlePoolArticle(updatedArticle);
};

export const deleteArticlePoolArticleService = async (id, user) => {
  ensureObjectId(id, "Content is invalid");

  const article = await ArticlePoolArticle.findById(id);

  if (!article) {
    throw new Error("Content not found");
  }

  await article.deleteOne();
};

export const getArticlePoolTemplatesService = async () => {
  return ArticlePoolTemplate.find()
    .populate({ path: "createdBy", select: "fullName email" })
    .sort({ createdAt: -1 });
};

export const createArticlePoolTemplateService = async (payload, currentUserId) => {
  const sanitized = sanitizeTemplatePayload(payload);
  await ensureUniqueTemplate(sanitized);

  return ArticlePoolTemplate.create({
    ...sanitized,
    createdBy: currentUserId,
  });
};

export const updateArticlePoolTemplateService = async (id, payload) => {
  ensureObjectId(id, "Info is invalid");

  const template = await ArticlePoolTemplate.findById(id);

  if (!template) {
    throw new Error("Info not found");
  }

  const sanitized = sanitizeTemplatePayload(payload);
  await ensureUniqueTemplate(sanitized, id);

  Object.assign(template, sanitized);
  await template.save();

  return ArticlePoolTemplate.findById(template._id).populate({
    path: "createdBy",
    select: "fullName email",
  });
};

export const deleteArticlePoolTemplateService = async (id) => {
  ensureObjectId(id, "Info is invalid");

  const template = await ArticlePoolTemplate.findById(id);

  if (!template) {
    throw new Error("Info not found");
  }

  const assignedCount = await ArticlePoolArticle.countDocuments({ templateId: id });

  if (assignedCount > 0) {
    throw new Error("Info is in use by content pool items");
  }

  await template.deleteOne();
};

export const getArticlePoolWritersService = async () => {
  const users = await User.find({ status: "active" }).populate({
    path: "groupId",
    populate: { path: "privilegeIds" },
  });

  return users
    .filter((user) => hasAnyPrivilege(user, [ARTICLE_WRITER_PRIVILEGE]))
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
