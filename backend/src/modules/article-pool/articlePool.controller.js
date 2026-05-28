import {
  createArticlePoolArticleService,
  deleteArticlePoolArticleService,
  exportArticlePoolCsvService,
  getArticlePoolArticleByIdService,
  getArticlePoolArticlesService,
  importArticlePoolCsvService,
  previewArticlePoolCsvImportService,
  updateArticlePoolArticleService,
} from "./articlePool.service.js";

function hasUserPrivilege(user, privilegeKey) {
  const privilegeKeys = user?.groupId?.privilegeIds?.map((item) => item.key) || [];
  const groupName = user?.groupId?.name?.toLowerCase();

  return groupName === "admin"
    || privilegeKeys.includes("ADMIN_ACCESS")
    || privilegeKeys.includes(privilegeKey);
}

export const getArticlePoolArticles = async (req, res) => {
  try {
    const articles = await getArticlePoolArticlesService(req.query, req.user);

    return res.json({
      success: true,
      data: articles,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getArticlePoolArticle = async (req, res) => {
  try {
    const article = await getArticlePoolArticleByIdService(req.params.id, req.user);

    return res.json({
      success: true,
      data: article,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const createArticlePoolArticle = async (req, res) => {
  try {
    const article = await createArticlePoolArticleService(req.body, req.user._id);

    return res.status(201).json({
      success: true,
      message: "Content created successfully",
      data: article,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const previewArticlePoolCsvImport = async (req, res) => {
  try {
    const result = await previewArticlePoolCsvImportService({
      ...req.body,
      allowUpdates: hasUserPrivilege(req.user, "EDIT_ARTICLE_POOL"),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const importArticlePoolCsv = async (req, res) => {
  try {
    const result = await importArticlePoolCsvService({
      ...req.body,
      userId: req.user?._id,
      allowUpdates: hasUserPrivilege(req.user, "EDIT_ARTICLE_POOL"),
    });

    req.auditLog = {
      ...(req.auditLog || {}),
      targetLabel: `${result.createdCount} created / ${result.updatedCount || 0} updated`,
      summary: `Imported ${result.createdCount} content pool row${result.createdCount === 1 ? "" : "s"} and updated ${result.updatedCount || 0} existing row${(result.updatedCount || 0) === 1 ? "" : "s"}`,
      details: result.skippedCount
        ? `${result.skippedCount} row${result.skippedCount === 1 ? "" : "s"} skipped`
        : "",
      metadata: {
        createdCount: result.createdCount,
        updatedCount: result.updatedCount || 0,
        skippedCount: result.skippedCount,
      },
    };

    return res.status(201).json({
      success: true,
      message: "Content pool CSV import completed",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const exportArticlePoolCsv = async (req, res) => {
  try {
    const csv = await exportArticlePoolCsvService(req.user);
    const timestamp = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="content-pool-${timestamp}.csv"`
    );

    return res.send(csv);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateArticlePoolArticle = async (req, res) => {
  try {
    const article = await updateArticlePoolArticleService(req.params.id, req.body, req.user);

    return res.json({
      success: true,
      message: "Content updated successfully",
      data: article,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteArticlePoolArticle = async (req, res) => {
  try {
    await deleteArticlePoolArticleService(req.params.id, req.user);

    return res.json({
      success: true,
      message: "Content deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
