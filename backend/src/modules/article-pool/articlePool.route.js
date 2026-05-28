import express from "express";
import {
  createArticlePoolArticle,
  deleteArticlePoolArticle,
  exportArticlePoolCsv,
  getArticlePoolArticle,
  getArticlePoolArticles,
  importArticlePoolCsv,
  previewArticlePoolCsvImport,
  updateArticlePoolArticle,
} from "./articlePool.controller.js";
import {
  requireAnyPrivilege,
  requireAuth,
  requirePrivilege,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();

const ARTICLE_POOL_VIEW_PRIVILEGES = [
  "READ_ARTICLE_POOL",
  "CREATE_ARTICLE_POOL",
  "EDIT_ARTICLE_POOL",
  "DELETE_ARTICLE_POOL",
  "IMPORT_ARTICLE_POOL",
  "EXPORT_ARTICLE_POOL",
  "ADMIN_ACCESS",
];

router.use(requireAuth);

router.get("/articles", requireAnyPrivilege(ARTICLE_POOL_VIEW_PRIVILEGES), getArticlePoolArticles);
router.get("/articles/:id", requireAnyPrivilege(ARTICLE_POOL_VIEW_PRIVILEGES), getArticlePoolArticle);
router.get("/export", requirePrivilege("EXPORT_ARTICLE_POOL"), exportArticlePoolCsv);
router.post("/articles", requirePrivilege("CREATE_ARTICLE_POOL"), createArticlePoolArticle);
router.post("/import/preview", requirePrivilege("IMPORT_ARTICLE_POOL"), previewArticlePoolCsvImport);
router.post("/import", requirePrivilege("IMPORT_ARTICLE_POOL"), importArticlePoolCsv);
router.put(
  "/articles/:id",
  requireAnyPrivilege(["EDIT_ARTICLE_POOL", "ADMIN_ACCESS"]),
  updateArticlePoolArticle
);
router.delete(
  "/articles/:id",
  requireAnyPrivilege(["DELETE_ARTICLE_POOL", "ADMIN_ACCESS"]),
  deleteArticlePoolArticle
);

export default router;
