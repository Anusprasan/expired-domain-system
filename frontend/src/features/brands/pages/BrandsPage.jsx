import React, { useState } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import BrandForm from "../components/BrandForm";
import BrandsTable from "../components/BrandsTable";
import { useBrands } from "../hooks/useBrands";
import ConfirmActionModal from "../../../shared/components/ConfirmActionModal";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";
import { hasPrivilege } from "../../../shared/utils/permissions";
import "../../../shared/styles/management.css";

export default function BrandsPage() {
  const { user } = useAuth();
  const { copy } = useUiLanguage();
  const brandsCopy = copy.brands;
  const { brands, loading, error, hasError, createBrand, updateBrand, deleteBrand } = useBrands();
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [pendingDeleteBrand, setPendingDeleteBrand] = useState(null);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyBrandId, setBusyBrandId] = useState("");

  const canCreateBrands = hasPrivilege(user, "CREATE_BRANDS");
  const canEditBrands = hasPrivilege(user, "EDIT_BRANDS");
  const canDeleteBrands = hasPrivilege(user, "DELETE_BRANDS");

  useEscapeKey(showBrandModal, () => {
    setShowBrandModal(false);
    setSelectedBrand(null);
  });

  useEscapeKey(Boolean(pendingDeleteBrand), () => setPendingDeleteBrand(null));

  const handleSubmit = async (form) => {
    try {
      setFormError("");
      setFormSuccess("");
      setBusy(true);

      if (selectedBrand) {
        await updateBrand(selectedBrand._id, form);
        setFormSuccess(brandsCopy.page.updateSuccess);
      } else {
        await createBrand(form);
        setFormSuccess(brandsCopy.page.createSuccess);
      }

      setShowBrandModal(false);
      setSelectedBrand(null);
    } catch (err) {
      setFormError(err.response?.data?.message || brandsCopy.page.saveError);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (brand) => {
    try {
      setFormError("");
      setFormSuccess("");
      setBusyBrandId(brand._id);
      await deleteBrand(brand._id);
      if (selectedBrand?._id === brand._id) {
        setSelectedBrand(null);
      }
      setPendingDeleteBrand(null);
      setFormSuccess(brandsCopy.page.deleteSuccess);
    } catch (err) {
      setFormError(err.response?.data?.message || brandsCopy.page.deleteError);
    } finally {
      setBusyBrandId("");
    }
  };

  return (
    <div className="management-page">
      <section className="app-panel management-header">
        <div>
          <h1>{brandsCopy.page.title}</h1>
          <p>{brandsCopy.page.description}</p>
        </div>
        <div className="management-header-actions">
          {canCreateBrands ? (
            <button
              type="button"
              className="management-button management-button-with-icon"
              onClick={() => {
                setFormError("");
                setFormSuccess("");
                setSelectedBrand(null);
                setShowBrandModal(true);
              }}
            >
              <span className="management-button-icon" aria-hidden="true">+</span>
              <span>{brandsCopy.page.createBrand}</span>
            </button>
          ) : null}
          <div className="management-summary">
            <strong>{brands.length}</strong>
            <span>{brandsCopy.page.totalBrands}</span>
          </div>
        </div>
      </section>

      <ToastNotice message={formError} onClose={() => setFormError("")} />
      <ToastNotice message={formSuccess} tone="success" onClose={() => setFormSuccess("")} />
      {hasError ? <p className="management-error">{error || brandsCopy.page.loadErrorFallback}</p> : null}

      {showBrandModal ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <BrandForm
              brands={brands}
              selectedBrand={selectedBrand}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowBrandModal(false);
                setSelectedBrand(null);
              }}
              busy={busy}
              showCancel
            />
          </div>
        </div>
      ) : null}

      {pendingDeleteBrand ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <ConfirmActionModal
              title={brandsCopy.page.deleteTitle}
              message={brandsCopy.page.deleteConfirm(pendingDeleteBrand.brandName)}
              confirmLabel={brandsCopy.page.deleteButton}
              busy={busyBrandId === pendingDeleteBrand._id}
              onConfirm={() => handleDelete(pendingDeleteBrand)}
              onCancel={() => setPendingDeleteBrand(null)}
            />
          </div>
        </div>
      ) : null}

      <div className="management-grid is-single-column">
        {loading ? (
          <section className="app-panel management-state">
            <h2>{brandsCopy.page.loadingTitle}</h2>
            <p>{brandsCopy.page.loadingDescription}</p>
          </section>
        ) : (
          <BrandsTable
            brands={brands}
            canEditBrands={canEditBrands}
            canDeleteBrands={canDeleteBrands}
            onEdit={(brand) => {
              if (!canEditBrands) {
                setFormError(brandsCopy.page.editPermissionError);
                return;
              }

              setFormError("");
              setFormSuccess("");
              setSelectedBrand(brand);
              setShowBrandModal(true);
            }}
            onDelete={(brand) => {
              if (!canDeleteBrands) {
                setFormError(brandsCopy.page.deletePermissionError);
                return;
              }

              setFormSuccess("");
              setPendingDeleteBrand(brand);
            }}
            busyBrandId={busyBrandId}
          />
        )}
      </div>
    </div>
  );
}
