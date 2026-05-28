import { useCallback, useEffect, useState } from "react";
import {
  createArticlePoolArticleApi,
  deleteArticlePoolArticleApi,
  getArticlePoolArticlesApi,
  updateArticlePoolArticleApi,
} from "../api/articlePoolApi";
import { useArticlePoolUiCopy } from "./useArticlePoolUiCopy";

function normalizeBrandName(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const legacyMatch = value.match(/brandname['"]?\s*:\s*['"]([^'"]+)['"]/i);
    return legacyMatch ? legacyMatch[1].trim().toUpperCase() : value.trim().toUpperCase();
  }

  if (typeof value === "object" && value.brandName) {
    return String(value.brandName).trim().toUpperCase();
  }

  return String(value).trim().toUpperCase();
}

function normalizeArticle(article) {
  return {
    ...article,
    brandName: normalizeBrandName(article.brandName),
  };
}

export function useArticlePool({
  loadArticles = true,
} = {}) {
  const { copy } = useArticlePoolUiCopy();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(loadArticles);
  const [error, setError] = useState("");

  const loadArticlePool = useCallback(async () => {
    try {
      setError("");
      setLoading(true);

      if (!loadArticles) {
        setArticles([]);
        setLoading(false);
        return;
      }

      const articlesResponse = await getArticlePoolArticlesApi();
      setArticles((articlesResponse.data || []).map(normalizeArticle));
    } catch (err) {
      setError(err.response?.data?.message || copy.page.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.page.loadError, loadArticles]);

  useEffect(() => {
    loadArticlePool();
  }, [loadArticlePool]);

  const createArticle = useCallback(async (payload) => {
    const response = await createArticlePoolArticleApi(payload);
    await loadArticlePool();
    return response;
  }, [loadArticlePool]);

  const updateArticle = useCallback(async (id, payload) => {
    const response = await updateArticlePoolArticleApi(id, payload);
    await loadArticlePool();
    return response;
  }, [loadArticlePool]);

  const deleteArticle = useCallback(async (id) => {
    const response = await deleteArticlePoolArticleApi(id);
    await loadArticlePool();
    return response;
  }, [loadArticlePool]);

  return {
    articles,
    loading,
    error,
    reloadArticlePool: loadArticlePool,
    createArticle,
    updateArticle,
    deleteArticle,
  };
}
