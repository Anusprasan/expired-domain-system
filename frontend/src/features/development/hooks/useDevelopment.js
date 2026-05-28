import { useCallback, useEffect, useState } from "react";
import {
  acquireDevelopmentContentLockApi,
  assignDevelopmentDomainApi,
  createDevelopmentTemplateApi,
  createDevelopmentDomainApi,
  deleteDevelopmentDomainApi,
  deleteDevelopmentTemplateApi,
  getDevelopmentDevelopersApi,
  getDevelopmentDomainsApi,
  getDevelopmentTemplatesApi,
  releaseDevelopmentContentLockApi,
  updateDevelopmentDomainApi,
  updateDevelopmentProgressApi,
} from "../api/developmentApi";
import { useDevelopmentUiCopy } from "./useDevelopmentUiCopy";

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

function normalizeDomain(domain) {
  return {
    ...domain,
    brandName: normalizeBrandName(domain.brandName),
  };
}

export function useDevelopment({
  loadDomains = true,
  loadDevelopers = true,
  loadTemplates = true,
} = {}) {
  const { copy } = useDevelopmentUiCopy();
  const [domains, setDomains] = useState([]);
  const [developers, setDevelopers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(loadDomains || loadDevelopers || loadTemplates);
  const [error, setError] = useState("");

  const loadDevelopment = useCallback(async () => {
    try {
      setError("");
      setLoading(true);

      const requests = [];

      if (loadDomains) {
        requests.push(getDevelopmentDomainsApi());
      }

      if (loadDevelopers) {
        requests.push(getDevelopmentDevelopersApi().catch(() => ({ data: [] })));
      }

      if (loadTemplates) {
        requests.push(getDevelopmentTemplatesApi().catch(() => ({ data: [] })));
      }

      if (!requests.length) {
        setDomains([]);
        setDevelopers([]);
        setTemplates([]);
        setLoading(false);
        return;
      }

      const responses = await Promise.all(requests);
      let responseIndex = 0;

      const domainsResponse = loadDomains ? responses[responseIndex++] : { data: [] };
      const developersResponse = loadDevelopers ? responses[responseIndex++] : { data: [] };
      const templatesResponse = loadTemplates ? responses[responseIndex++] : { data: [] };

      setDomains((domainsResponse.data || []).map(normalizeDomain));
      setDevelopers(developersResponse.data || []);
      setTemplates(templatesResponse.data || []);
    } catch (err) {
      setError(err.response?.data?.message || copy.page.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.page.loadError, loadDevelopers, loadDomains, loadTemplates]);

  useEffect(() => {
    loadDevelopment();
  }, [loadDevelopment]);

  const createDomain = useCallback(async (payload) => {
    const response = await createDevelopmentDomainApi(payload);
    await loadDevelopment();
    return response;
  }, [loadDevelopment]);

  const createTemplate = useCallback(async (payload) => {
    const response = await createDevelopmentTemplateApi(payload);
    await loadDevelopment();
    return response;
  }, [loadDevelopment]);

  const deleteTemplate = useCallback(async (id) => {
    const response = await deleteDevelopmentTemplateApi(id);
    await loadDevelopment();
    return response;
  }, [loadDevelopment]);

  const assignDomain = useCallback(async (id, developerId) => {
    const response = await assignDevelopmentDomainApi(id, developerId);
    await loadDevelopment();
    return response;
  }, [loadDevelopment]);

  const updateDomain = useCallback(async (id, payload) => {
    const response = await updateDevelopmentDomainApi(id, payload);
    await loadDevelopment();
    return response;
  }, [loadDevelopment]);

  const deleteDomain = useCallback(async (id) => {
    const response = await deleteDevelopmentDomainApi(id);
    await loadDevelopment();
    return response;
  }, [loadDevelopment]);

  const updateProgress = useCallback(async (id, payload) => {
    const response = await updateDevelopmentProgressApi(id, payload);
    await loadDevelopment();
    return response;
  }, [loadDevelopment]);

  const acquireContentLock = useCallback(async (id) => {
    const response = await acquireDevelopmentContentLockApi(id);
    await loadDevelopment();
    return response;
  }, [loadDevelopment]);

  const releaseContentLock = useCallback(async (id) => {
    const response = await releaseDevelopmentContentLockApi(id);
    await loadDevelopment();
    return response;
  }, [loadDevelopment]);

  return {
    domains,
    developers,
    templates,
    loading,
    error,
    reloadDevelopment: loadDevelopment,
    createDomain,
    createTemplate,
    deleteTemplate,
    assignDomain,
    updateDomain,
    deleteDomain,
    updateProgress,
    acquireContentLock,
    releaseContentLock,
  };
}
