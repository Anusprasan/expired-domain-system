import { useCallback, useEffect, useState } from "react";
import {
  bulkDeleteBlockedMoneySitesApi,
  createMoneySiteApi,
  deleteMoneySiteApi,
  exportMoneySitesCsvApi,
  getMoneySiteDomainsApi,
  getMoneySiteSummaryApi,
  getMoneySitesApi,
  importMoneySitesCsvApi,
  previewMoneySitesCsvImportApi,
  updateMoneySiteApi,
} from "../api/moneySitesApi";

const DEFAULT_PAGINATION = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 1,
};

const DEFAULT_SUMMARY = {
  total: 0,
  blocked: 0,
  notBlocked: 0,
  unknown: 0,
  blockedItems: [],
};

export function useMoneySites(filters) {
  const [moneySites, setMoneySites] = useState([]);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [summary, setSummary] = useState(DEFAULT_SUMMARY);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [hasSummaryError, setHasSummaryError] = useState(false);
  const [existingDomains, setExistingDomains] = useState([]);
  const [domainIndexLoading, setDomainIndexLoading] = useState(true);
  const [domainIndexError, setDomainIndexError] = useState("");
  const [hasDomainIndexError, setHasDomainIndexError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasError, setHasError] = useState(false);

  const loadMoneySites = useCallback(async () => {
    try {
      setError("");
      setHasError(false);
      setLoading(true);
      const response = await getMoneySitesApi(filters);
      setMoneySites(response.data?.items || []);
      setPagination(response.data?.pagination || DEFAULT_PAGINATION);
    } catch (err) {
      setError(err.response?.data?.message || "");
      setHasError(true);
      setPagination(DEFAULT_PAGINATION);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadMoneySiteDomains = useCallback(async () => {
    try {
      setDomainIndexError("");
      setHasDomainIndexError(false);
      setDomainIndexLoading(true);
      const response = await getMoneySiteDomainsApi();
      setExistingDomains(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setExistingDomains([]);
      setDomainIndexError(err.response?.data?.message || "");
      setHasDomainIndexError(true);
    } finally {
      setDomainIndexLoading(false);
    }
  }, []);

  const loadMoneySiteSummary = useCallback(async () => {
    try {
      setSummaryError("");
      setHasSummaryError(false);
      setSummaryLoading(true);
      const response = await getMoneySiteSummaryApi();
      setSummary(response.data || DEFAULT_SUMMARY);
    } catch (err) {
      setSummary(DEFAULT_SUMMARY);
      setSummaryError(err.response?.data?.message || "");
      setHasSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMoneySites();
  }, [loadMoneySites]);

  useEffect(() => {
    loadMoneySiteDomains();
  }, [loadMoneySiteDomains]);

  useEffect(() => {
    loadMoneySiteSummary();
  }, [loadMoneySiteSummary]);

  const createMoneySite = useCallback(async (payload) => {
    const response = await createMoneySiteApi(payload);
    await Promise.all([loadMoneySites(), loadMoneySiteDomains(), loadMoneySiteSummary()]);
    return response;
  }, [loadMoneySites, loadMoneySiteDomains, loadMoneySiteSummary]);

  const importMoneySitesCsv = useCallback(async (payload) => {
    const response = await importMoneySitesCsvApi(payload);
    await Promise.all([loadMoneySites(), loadMoneySiteDomains(), loadMoneySiteSummary()]);
    return response;
  }, [loadMoneySites, loadMoneySiteDomains, loadMoneySiteSummary]);

  const previewMoneySitesCsvImport = useCallback(async (payload) => {
    const response = await previewMoneySitesCsvImportApi(payload);
    return response;
  }, []);

  const exportMoneySitesCsv = useCallback(async (params = {}) => {
    const response = await exportMoneySitesCsvApi(params);
    return response;
  }, []);

  const updateMoneySite = useCallback(async (id, payload) => {
    const response = await updateMoneySiteApi(id, payload);
    await Promise.all([loadMoneySites(), loadMoneySiteDomains(), loadMoneySiteSummary()]);
    return response;
  }, [loadMoneySites, loadMoneySiteDomains, loadMoneySiteSummary]);

  const deleteMoneySite = useCallback(async (id) => {
    const response = await deleteMoneySiteApi(id);
    await Promise.all([loadMoneySites(), loadMoneySiteDomains(), loadMoneySiteSummary()]);
    return response;
  }, [loadMoneySites, loadMoneySiteDomains, loadMoneySiteSummary]);

  const bulkDeleteBlockedMoneySites = useCallback(async (payload) => {
    const response = await bulkDeleteBlockedMoneySitesApi(payload);
    await Promise.all([loadMoneySites(), loadMoneySiteDomains(), loadMoneySiteSummary()]);
    return response;
  }, [loadMoneySites, loadMoneySiteDomains, loadMoneySiteSummary]);

  return {
    moneySites,
    pagination,
    summary,
    summaryLoading,
    summaryError,
    hasSummaryError,
    existingDomains,
    domainIndexLoading,
    domainIndexError,
    hasDomainIndexError,
    loading,
    error,
    hasError,
    reloadMoneySites: loadMoneySites,
    reloadMoneySiteDomains: loadMoneySiteDomains,
    reloadMoneySiteSummary: loadMoneySiteSummary,
    createMoneySite,
    previewMoneySitesCsvImport,
    importMoneySitesCsv,
    exportMoneySitesCsv,
    updateMoneySite,
    deleteMoneySite,
    bulkDeleteBlockedMoneySites,
  };
}
