import { useCallback, useEffect, useState } from "react";
import {
  createBrandApi,
  deleteBrandApi,
  getBrandsApi,
  updateBrandApi,
} from "../api/brandsApi";

export function useBrands() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasError, setHasError] = useState(false);

  const loadBrands = useCallback(async () => {
    try {
      setError("");
      setHasError(false);
      setLoading(true);
      const response = await getBrandsApi();
      setBrands(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "");
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  const createBrand = useCallback(async (payload) => {
    const response = await createBrandApi(payload);
    await loadBrands();
    return response;
  }, [loadBrands]);

  const updateBrand = useCallback(async (id, payload) => {
    const response = await updateBrandApi(id, payload);
    await loadBrands();
    return response;
  }, [loadBrands]);

  const deleteBrand = useCallback(async (id) => {
    const response = await deleteBrandApi(id);
    await loadBrands();
    return response;
  }, [loadBrands]);

  return {
    brands,
    loading,
    error,
    hasError,
    reloadBrands: loadBrands,
    createBrand,
    updateBrand,
    deleteBrand,
  };
}
