import React, { useMemo, useState } from "react";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";

export default function BrandsTable({
  brands,
  onEdit,
  onDelete,
  busyBrandId,
  canEditBrands,
  canDeleteBrands,
}) {
  const { copy } = useUiLanguage();
  const brandsCopy = copy.brands;
  const [query, setQuery] = useState("");

  const filteredBrands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return brands;
    }

    return brands.filter((brand) =>
      [
        brand.brandName,
        brand.cssClassName,
        brand.backgroundStyle,
        brand.backgroundCss,
        brand.textColor,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [brands, query]);

  return (
    <section className="app-panel management-table">
      <div className="management-section-header">
        <div>
          <h2>{brandsCopy.table.title}</h2>
          <p>{brandsCopy.table.description}</p>
        </div>
        <div className="management-search">
          <label htmlFor="brand-search">{brandsCopy.table.search}</label>
          <input
            id="brand-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={brandsCopy.table.searchPlaceholder}
          />
        </div>
      </div>

      <div className="management-table-wrap">
        <table className="brands-management-table">
          <thead>
            <tr>
              <th>{brandsCopy.table.headers.brand}</th>
              <th>{brandsCopy.table.headers.preview}</th>
              <th>{brandsCopy.table.headers.style}</th>
              <th>{brandsCopy.table.headers.actions}</th>
            </tr>
          </thead>
          <tbody>
            {filteredBrands.map((brand) => {
              const isBusy = busyBrandId === brand._id;

              return (
                <tr key={brand._id}>
                  <td className="brands-name-cell">
                    <strong>{brand.brandName.toUpperCase()}</strong>
                  </td>
                  <td className="brands-preview-cell">
                    <div
                      className="management-brand-chip"
                      style={{ background: brand.backgroundCss, color: brand.textColor }}
                    >
                      {brand.brandName.toUpperCase()}
                    </div>
                  </td>
                  <td className="brands-style-cell">
                    <div className="management-stack">
                      <span>
                        {brand.backgroundStyle === "solid"
                          ? brandsCopy.form.solid
                          : brand.backgroundStyle === "linear-gradient"
                            ? brandsCopy.form.linearGradient
                            : brand.backgroundStyle === "radial-gradient"
                              ? brandsCopy.form.radialGradient
                              : brand.backgroundStyle}
                      </span>
                      <span>{brand.textColor}</span>
                    </div>
                  </td>
                  <td className="brands-actions-cell">
                    <div className="management-inline-actions">
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={() => onEdit(brand)}
                        disabled={!canEditBrands}
                      >
                        {brandsCopy.table.edit}
                      </button>
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={() => onDelete(brand)}
                        disabled={isBusy || !canDeleteBrands}
                      >
                        {brandsCopy.table.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!brands.length ? <p className="management-empty">{brandsCopy.table.empty}</p> : null}
      {brands.length && !filteredBrands.length ? <p className="management-empty">{brandsCopy.table.noMatches}</p> : null}
    </section>
  );
}
