import React from "react";
import {
  getMoneySiteByDomain,
  getMoneySiteId,
  getMoneySiteLabel,
  getSelectedMoneySite,
} from "../utils/shortLinkCheckerUi";

export default function ShortLinkEntryModal({ copy, form, moneySites, saving, onClose, onFormChange, onSubmit }) {
  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="management-modal-backdrop is-centered" role="presentation" onMouseDown={handleBackdropMouseDown}>
      <div
        className="app-panel management-modal short-link-checker-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="short-link-entry-title"
      >
        <div className="short-link-checker-modal-header">
          <div>
            <span className="management-badge">{form.id ? copy.entryModal.editBadge : copy.entryModal.addBadge}</span>
            <h2 id="short-link-entry-title">{form.id ? copy.entryModal.editTitle : copy.entryModal.addTitle}</h2>
            <p>{copy.entryModal.description}</p>
          </div>
          <button type="button" className="management-button-secondary" onClick={onClose}>
            {copy.common.close}
          </button>
        </div>

        <form className="short-link-checker-modal-form" onSubmit={onSubmit}>
          <div className="short-link-checker-field-grid">
            <label className="management-field" htmlFor="short-link-title">
              <span>{copy.entryModal.nameLabel}</span>
              <input
                id="short-link-title"
                value={form.title}
                onChange={(event) => onFormChange({ title: event.target.value })}
                placeholder={copy.entryModal.namePlaceholder}
              />
            </label>

            <label className="management-field" htmlFor="short-link-url">
              <span>{copy.entryModal.shortLinkLabel}</span>
              <input
                id="short-link-url"
                value={form.shortUrl}
                onChange={(event) => onFormChange({ shortUrl: event.target.value })}
                placeholder="https://cutt.ly/example"
                required
              />
            </label>
          </div>

          <div className="short-link-checker-field-grid">
            <label className="management-field" htmlFor="short-link-money-site">
              <span>{copy.entryModal.assignMoneySite}</span>
              <select
                id="short-link-money-site"
                value={form.moneySiteId}
                onChange={(event) => {
                  const site = getSelectedMoneySite(moneySites, event.target.value);
                  onFormChange({
                    moneySiteId: event.target.value,
                    moneySiteDomain: site?.domain || form.moneySiteDomain,
                  });
                }}
              >
                <option value="">{copy.entryModal.noMoneySite}</option>
                {moneySites.map((site) => (
                  <option key={getMoneySiteId(site)} value={getMoneySiteId(site)}>
                    {getMoneySiteLabel(site, copy)}
                  </option>
                ))}
              </select>
            </label>

            <label className="management-field" htmlFor="short-link-money-site-domain">
              <span>{copy.entryModal.moneySiteDomain}</span>
              <input
                id="short-link-money-site-domain"
                value={form.moneySiteDomain}
                onChange={(event) => {
                  const moneySiteDomain = event.target.value;
                  const matchedSite = getMoneySiteByDomain(moneySites, moneySiteDomain);
                  onFormChange({
                    moneySiteDomain,
                    moneySiteId: matchedSite ? getMoneySiteId(matchedSite) : form.moneySiteId,
                  });
                }}
                placeholder={copy.entryModal.moneySiteDomainPlaceholder}
              />
            </label>
          </div>

          <label className="management-field" htmlFor="short-link-note">
            <span>{copy.entryModal.note}</span>
            <textarea
              id="short-link-note"
              value={form.note}
              onChange={(event) => onFormChange({ note: event.target.value })}
              placeholder={copy.entryModal.notePlaceholder}
            />
          </label>

          <label className="management-checkbox">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => onFormChange({ active: event.target.checked })}
            />
            <span className="management-checkbox-copy">
              <strong>{copy.entryModal.activeTitle}</strong>
              <small className="management-checkbox-meta">{copy.entryModal.activeDescription}</small>
            </span>
          </label>

          <div className="short-link-checker-modal-actions">
            <button type="submit" className="management-button" disabled={saving}>
              {saving ? copy.entryModal.saving : form.id ? copy.entryModal.save : copy.entryModal.add}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
