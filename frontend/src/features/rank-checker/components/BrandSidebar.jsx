import { useMemo, useState } from "react";

function getPreviewStyle(brand) {
  if (brand.backgroundCss && brand.textColor) {
    return {
      background: brand.backgroundCss,
      color: brand.textColor,
    };
  }

  return {
    background: "linear-gradient(135deg, #38476d 0%, #2a3654 100%)",
    color: "#ffffff",
  };
}

export default function BrandSidebar({ brands, selectedBrandId, onSelect }) {
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredBrands = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brands;

    return brands.filter((brand) =>
      [brand.code, brand.name]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(q))
    );
  }, [brands, search]);

  const renderBrandButton = (brand, closeOnSelect = false) => {
    const active = selectedBrandId === brand._id;
    const previewStyle = getPreviewStyle(brand);

    return (
      <button
        key={brand._id || brand.code}
        type="button"
        onClick={() => {
          onSelect(brand);
          if (closeOnSelect) {
            setMobileOpen(false);
          }
        }}
        className={`w-full rounded-md border px-3 py-2 text-left transition ${
          active
            ? "border-indigo-500 bg-indigo-50"
            : "border-slate-200 bg-white hover:bg-slate-50"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold uppercase text-indigo-700">{brand.code}</span>
        </div>
        <div className="mt-2 flex justify-end">
          <span
            className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
            style={previewStyle}
          >
            {brand.name}
          </span>
        </div>
      </button>
    );
  };

  return (
    <>
      <div className="border-b border-slate-200 bg-white p-3 lg:hidden">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-700">Brand List</p>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Browse Brands
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {brands.map((brand) => {
            const active = selectedBrandId === brand._id;
            return (
              <button
                key={brand._id || brand.code}
                type="button"
                onClick={() => onSelect(brand)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {brand.code}
              </button>
            );
          })}
          {brands.length === 0 ? <p className="text-xs text-slate-500">No brands available.</p> : null}
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close brand panel"
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[86%] max-w-sm overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Brands</h2>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
              >
                Close
              </button>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="Search code or name..."
            />
            <div className="space-y-2">{filteredBrands.map((brand) => renderBrandButton(brand, true))}</div>
          </aside>
        </div>
      ) : null}

      <aside className="hidden border-r border-slate-200 bg-white p-4 lg:flex lg:h-full lg:w-80 lg:shrink-0 lg:flex-col">
        <h2 className="mb-3 text-lg font-semibold">Brands</h2>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          placeholder="Search code or name..."
        />
        <div className="space-y-2 overflow-y-auto lg:flex-1">{filteredBrands.map((brand) => renderBrandButton(brand))}</div>
      </aside>
    </>
  );
}
