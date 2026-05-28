import React, { useMemo, useState } from "react";
import ConfirmActionModal from "../../../shared/components/ConfirmActionModal";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { useDevelopmentUiCopy } from "../hooks/useDevelopmentUiCopy";

export default function EditDevelopmentDomainForm({
  brands,
  domainItem,
  busy,
  canDelete = false,
  onSubmit,
  onDelete,
  onCancel,
}) {
  const { copy } = useDevelopmentUiCopy();
  const [form, setForm] = useState({
    brandName: domainItem?.brandName || "",
    domain: domainItem?.domain || "",
    landingPage: domainItem?.landingPage || "",
    termsAndConditionsPage: domainItem?.termsAndConditionsPage || "",
    aboutPage: domainItem?.aboutPage || "",
    contactPage: domainItem?.contactPage || "",
  });
  const [localError, setLocalError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const brandOptions = useMemo(
    () => [...brands].sort((left, right) => left.brandName.localeCompare(right.brandName)),
    [brands]
  );

  useEscapeKey(showDeleteConfirm, () => setShowDeleteConfirm(false));

  const handleChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.domain.trim()) {
      setLocalError(copy.editDomainForm.domainRequired);
      return;
    }

    if (!form.landingPage.trim()) {
      setLocalError(copy.editDomainForm.landingRequired);
      return;
    }

    try {
      setLocalError("");
      await onSubmit(form);
    } catch (error) {
      setLocalError(error.response?.data?.message || copy.editDomainForm.updateError);
    }
  };

  const handleDelete = async () => {
    try {
      setLocalError("");
      await onDelete();
    } catch (error) {
      setLocalError(error.response?.data?.message || copy.editDomainForm.deleteError);
    }
  };

  return (
    <>
      <form className="app-panel management-form" onSubmit={handleSubmit}>
        <div className="management-section-header">
          <div>
            <h2>{copy.editDomainForm.title}</h2>
            <p>{copy.editDomainForm.description}</p>
          </div>
        </div>

        <ToastNotice message={localError} onClose={() => setLocalError("")} />

        <div className="management-fields">
          <div className="management-field">
            <label htmlFor="edit-development-brandName">{copy.editDomainForm.brand}</label>
            <select
              id="edit-development-brandName"
              value={form.brandName}
              onChange={(event) => handleChange("brandName", event.target.value)}
              disabled={busy}
            >
              <option value="">{copy.editDomainForm.selectBrand}</option>
              {brandOptions.map((brand) => (
                <option key={brand._id} value={brand.brandName}>
                  {brand.brandName}
                </option>
              ))}
            </select>
          </div>

          <div className="management-field">
            <label htmlFor="edit-development-domain">{copy.editDomainForm.domain}</label>
            <input
              id="edit-development-domain"
              value={form.domain}
              onChange={(event) => handleChange("domain", event.target.value)}
              placeholder={copy.editDomainForm.domainPlaceholder}
              disabled={busy}
            />
          </div>

          <div className="management-field">
            <label htmlFor="edit-development-landingPage">{copy.editDomainForm.landingPage}</label>
            <input
              id="edit-development-landingPage"
              value={form.landingPage}
              onChange={(event) => handleChange("landingPage", event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="management-field">
            <label htmlFor="edit-development-termsPage">{copy.editDomainForm.termsAndConditionsPage}</label>
            <input
              id="edit-development-termsPage"
              value={form.termsAndConditionsPage}
              onChange={(event) => handleChange("termsAndConditionsPage", event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="management-field">
            <label htmlFor="edit-development-aboutPage">{copy.editDomainForm.aboutPage}</label>
            <input
              id="edit-development-aboutPage"
              value={form.aboutPage}
              onChange={(event) => handleChange("aboutPage", event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="management-field">
            <label htmlFor="edit-development-contactPage">{copy.editDomainForm.contactPage}</label>
            <input
              id="edit-development-contactPage"
              value={form.contactPage}
              onChange={(event) => handleChange("contactPage", event.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="management-actions">
          <button type="submit" className="management-button" disabled={busy}>
            {busy ? copy.common.saving : copy.editDomainForm.saveChanges}
          </button>
          {canDelete ? (
            <button
              type="button"
              className="management-button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={busy}
            >
              {copy.editDomainForm.deleteDomain}
            </button>
          ) : null}
          <button type="button" className="management-button-secondary" onClick={onCancel} disabled={busy}>
            {copy.editDomainForm.cancel}
          </button>
        </div>
      </form>

      {showDeleteConfirm ? (
        <div className="management-modal-backdrop is-centered">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <ConfirmActionModal
              title={copy.editDomainForm.deleteTitle}
              message={copy.editDomainForm.deleteMessage(domainItem?.domain)}
              confirmLabel={copy.editDomainForm.deleteDomain}
              cancelLabel={copy.editDomainForm.cancel}
              busyLabel={copy.common.saving}
              busy={busy}
              onConfirm={handleDelete}
              onCancel={() => setShowDeleteConfirm(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
