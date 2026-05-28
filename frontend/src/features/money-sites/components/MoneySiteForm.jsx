import React, { useEffect, useMemo, useState } from "react";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useMoneySiteUiCopy } from "../hooks/useMoneySiteUiCopy";

const EMPTY_FORM = {
  brandId: "",
  domain: "",
  note: "",
  statusText: "",
};

export default function MoneySiteForm({
  brands,
  selectedMoneySite,
  onSubmit,
  onCancel,
  busy,
  showCancel = true,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [localError, setLocalError] = useState("");
  const isEditing = Boolean(selectedMoneySite);
  const { copy } = useMoneySiteUiCopy();

  const sortedBrands = useMemo(
    () => [...brands].sort((left, right) => left.brandName.localeCompare(right.brandName)),
    [brands]
  );

  useEffect(() => {
    if (!selectedMoneySite) {
      setForm({
        ...EMPTY_FORM,
        brandId: sortedBrands[0]?._id || "",
      });
      setLocalError("");
      return;
    }

    setForm({
      brandId: selectedMoneySite.brandId?._id || selectedMoneySite.brandId || "",
      domain: selectedMoneySite.domain || "",
      note: selectedMoneySite.note || "",
      statusText: selectedMoneySite.statusText || "",
    });
    setLocalError("");
  }, [selectedMoneySite, sortedBrands]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setLocalError("");
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.brandId) {
      setLocalError(copy.form.brandRequired);
      return;
    }

    if (!form.domain.trim()) {
      setLocalError(copy.form.domainRequired);
      return;
    }

    onSubmit({
      brandId: form.brandId,
      domain: form.domain,
      note: form.note,
      statusText: form.statusText,
    });
  };

  return (
    <section className="app-panel management-form">
      <ToastNotice message={localError} onClose={() => setLocalError("")} />
      <h2>{isEditing ? copy.form.editTitle : copy.form.addTitle}</h2>
      <p>{copy.form.description}</p>

      <form onSubmit={handleSubmit} className="management-fields">
        <div className="management-field">
          <label htmlFor="money-site-brand">{copy.form.brandLabel}</label>
          <select
            id="money-site-brand"
            name="brandId"
            value={form.brandId}
            onChange={handleChange}
            required
          >
            <option value="">{copy.form.selectBrand}</option>
            {sortedBrands.map((brand) => (
              <option key={brand._id} value={brand._id}>
                {brand.brandName}
              </option>
            ))}
          </select>
        </div>

        <div className="management-field">
          <label htmlFor="money-site-domain">{copy.form.domainLabel}</label>
          <input
            id="money-site-domain"
            name="domain"
            value={form.domain}
            onChange={handleChange}
            placeholder="b200m-slot.fun"
            required
          />
        </div>

        <div className="management-field">
          <label htmlFor="money-site-note">{copy.form.noteLabel}</label>
          <textarea
            id="money-site-note"
            name="note"
            value={form.note}
            onChange={handleChange}
            placeholder={copy.form.notePlaceholder}
          />
        </div>

        <div className="management-field">
          <label htmlFor="money-site-status-text">{copy.form.statusLabel}</label>
          <textarea
            id="money-site-status-text"
            name="statusText"
            value={form.statusText}
            onChange={handleChange}
            placeholder={copy.form.statusPlaceholder}
          />
        </div>

        <div className="management-actions">
          <button type="submit" className="management-button" disabled={busy}>
            {busy
              ? copy.form.savingButton
              : isEditing
                ? copy.form.saveButton
                : copy.form.createButton}
          </button>
          {showCancel ? (
            <button type="button" className="management-button-secondary" onClick={onCancel} disabled={busy}>
              {copy.form.cancelButton}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
