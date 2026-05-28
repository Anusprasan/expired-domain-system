import React, { useEffect, useMemo, useState } from "react";
import { HiOutlineColorSwatch } from "react-icons/hi";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";

const EMPTY_FORM = {
  brandName: "",
  cssClassName: "",
  backgroundStyle: "solid",
  backgroundColor: "#38476d",
  gradientDirection: "90deg",
  gradientPosition: "circle at center",
  gradientStopsText: "#38476d 0%\n#020612 100%",
  textColor: "#ffffff",
};

const GRADIENT_POSITION_OPTIONS = [
  { value: "circle at center", label: "Center" },
  { value: "circle at top", label: "Top" },
  { value: "circle at bottom", label: "Bottom" },
  { value: "circle at left", label: "Left" },
  { value: "circle at right", label: "Right" },
  { value: "circle at top left", label: "Top Left" },
  { value: "circle at top right", label: "Top Right" },
  { value: "circle at bottom left", label: "Bottom Left" },
  { value: "circle at bottom right", label: "Bottom Right" },
  { value: "ellipse at center", label: "Ellipse Center" },
  { value: "ellipse at top", label: "Ellipse Top" },
  { value: "ellipse at bottom", label: "Ellipse Bottom" },
  { value: "ellipse at left", label: "Ellipse Left" },
  { value: "ellipse at right", label: "Ellipse Right" },
  { value: "ellipse at top left", label: "Ellipse Top Left" },
  { value: "ellipse at top right", label: "Ellipse Top Right" },
  { value: "ellipse at bottom left", label: "Ellipse Bottom Left" },
  { value: "ellipse at bottom right", label: "Ellipse Bottom Right" },
  { value: "circle closest-side at center", label: "Circle Closest Side" },
  { value: "circle farthest-side at center", label: "Circle Farthest Side" },
  { value: "circle closest-corner at center", label: "Circle Closest Corner" },
  { value: "circle farthest-corner at center", label: "Circle Farthest Corner" },
  { value: "ellipse closest-side at center", label: "Ellipse Closest Side" },
  { value: "ellipse farthest-side at center", label: "Ellipse Farthest Side" },
  { value: "ellipse closest-corner at center", label: "Ellipse Closest Corner" },
  { value: "ellipse farthest-corner at center", label: "Ellipse Farthest Corner" },
];

const formatBrandName = (value) => value.trim().replace(/\s+/g, " ");
const formatBrandNameDisplay = (value) => formatBrandName(value).toUpperCase();
const buildCssClassName = (brandName) =>
  `brand-${formatBrandName(brandName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
const parseGradientStops = (value) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
const getGradientDirectionNumber = (value) => String(value || "").replace(/[^\d.-]/g, "");
const normalizeGradientDirection = (value) => {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  const parsedValue = Number(value);
  if (Number.isNaN(parsedValue)) {
    return "";
  }

  return ((parsedValue % 360) + 360) % 360;
};

const buildPreviewBackground = (form) => {
  if (form.backgroundStyle === "solid") {
    return form.backgroundColor;
  }

  const gradientStops = parseGradientStops(form.gradientStopsText);

  if (form.backgroundStyle === "linear-gradient") {
    return `linear-gradient(${form.gradientDirection}, ${gradientStops.join(", ")})`;
  }

  return `radial-gradient(${form.gradientPosition}, ${gradientStops.join(", ")})`;
};

function ColorInputField({ id, name, label, value, onChange, placeholder }) {
  return (
    <div className="management-field">
      <label htmlFor={id}>{label}</label>
      <div className="management-color-input">
        <input id={id} name={name} value={value} onChange={onChange} placeholder={placeholder} required />
        <label className="management-color-picker" htmlFor={`${id}-picker`} aria-label={`Pick ${label.toLowerCase()}`}>
          <HiOutlineColorSwatch aria-hidden="true" />
        </label>
        <input
          id={`${id}-picker`}
          className="management-color-picker-native"
          type="color"
          value={value}
          onChange={(event) =>
            onChange({
              target: {
                name,
                value: event.target.value,
              },
            })
          }
          tabIndex={-1}
        />
      </div>
    </div>
  );
}

export default function BrandForm({ brands = [], selectedBrand, onSubmit, onCancel, busy, showCancel = true }) {
  const { copy } = useUiLanguage();
  const brandsCopy = copy.brands;
  const [form, setForm] = useState(EMPTY_FORM);
  const [localError, setLocalError] = useState("");
  const isEditing = Boolean(selectedBrand);

  useEffect(() => {
    if (!selectedBrand) {
      setForm(EMPTY_FORM);
      setLocalError("");
      return;
    }

    setForm({
      brandName: selectedBrand.brandName || "",
      cssClassName: selectedBrand.cssClassName || "",
      backgroundStyle: selectedBrand.backgroundStyle || "solid",
      backgroundColor: selectedBrand.backgroundColor || "#38476d",
      gradientDirection: selectedBrand.gradientDirection || "90deg",
      gradientPosition: selectedBrand.gradientPosition || "circle at center",
      gradientStopsText: (selectedBrand.gradientStops || []).join("\n") || "#38476d 0%\n#020612 100%",
      textColor: selectedBrand.textColor || "#ffffff",
    });
    setLocalError("");
  }, [selectedBrand]);

  const previewBackground = useMemo(() => buildPreviewBackground(form), [form]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setLocalError("");
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleGradientDirectionChange = (event) => {
    const rawValue = event.target.value.replace(/\D/g, "");
    const numericValue = rawValue ? String(normalizeGradientDirection(Number(rawValue))) : "";
    setLocalError("");
    setForm((current) => ({
      ...current,
      gradientDirection: numericValue ? `${numericValue}deg` : "",
    }));
  };

  const handleGradientDirectionKeyDown = (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    event.preventDefault();

    const currentValue = Number(getGradientDirectionNumber(form.gradientDirection) || 0);
    const nextValue = event.key === "ArrowUp"
      ? normalizeGradientDirection(currentValue + 1)
      : normalizeGradientDirection(currentValue - 1);

    setLocalError("");
    setForm((current) => ({
      ...current,
      gradientDirection: `${nextValue}deg`,
    }));
  };

  const handleGradientDirectionStep = (delta) => {
    const currentValue = Number(getGradientDirectionNumber(form.gradientDirection) || 0);
    const nextValue = normalizeGradientDirection(currentValue + delta);

    setLocalError("");
    setForm((current) => ({
      ...current,
      gradientDirection: `${nextValue}deg`,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const brandName = formatBrandName(form.brandName);
    const cssClassName = form.cssClassName.trim() || buildCssClassName(brandName);
    const gradientStops = parseGradientStops(form.gradientStopsText);

    if (!brandName) {
      setLocalError(brandsCopy.form.errors.brandNameRequired);
      return;
    }

    const conflictingBrand = brands.find((brand) => {
      if (brand._id === selectedBrand?._id) {
        return false;
      }

      return brand.brandName.trim().toLowerCase() === brandName.toLowerCase();
    });

    if (conflictingBrand) {
      setLocalError(brandsCopy.form.errors.brandExists);
      return;
    }

    if (form.backgroundStyle === "solid" && !form.backgroundColor.trim()) {
      setLocalError(brandsCopy.form.errors.backgroundColorRequired);
      return;
    }

    if (form.backgroundStyle !== "solid" && gradientStops.length < 2) {
      setLocalError(brandsCopy.form.errors.gradientStopsRequired);
      return;
    }

    if (form.backgroundStyle === "linear-gradient" && !form.gradientDirection.trim()) {
      setLocalError(brandsCopy.form.errors.gradientDirectionRequired);
      return;
    }

    if (form.backgroundStyle === "radial-gradient" && !form.gradientPosition.trim()) {
      setLocalError(brandsCopy.form.errors.gradientPositionRequired);
      return;
    }

    if (!form.textColor.trim()) {
      setLocalError(brandsCopy.form.errors.textColorRequired);
      return;
    }

    onSubmit({
      brandName,
      cssClassName,
      backgroundStyle: form.backgroundStyle,
      backgroundColor: form.backgroundStyle === "solid" ? form.backgroundColor.trim() : "",
      gradientDirection: form.backgroundStyle === "linear-gradient" ? form.gradientDirection.trim() : "",
      gradientPosition: form.backgroundStyle === "radial-gradient" ? form.gradientPosition.trim() : "",
      gradientStops: form.backgroundStyle === "solid" ? [] : gradientStops,
      textColor: form.textColor.trim(),
    });
  };

  return (
    <section className="app-panel management-form">
      <ToastNotice message={localError} onClose={() => setLocalError("")} />
      <h2>{isEditing ? brandsCopy.form.titleEdit : brandsCopy.form.titleCreate}</h2>
      <p>{brandsCopy.form.description}</p>

      <div className="management-brand-preview" style={{ background: previewBackground, color: form.textColor }}>
        <strong>{formatBrandNameDisplay(form.brandName) || brandsCopy.form.previewFallback}</strong>
        <span>
          {form.backgroundStyle === "solid"
            ? brandsCopy.form.solid
            : form.backgroundStyle === "linear-gradient"
              ? brandsCopy.form.linearGradient
              : brandsCopy.form.radialGradient}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="management-fields">
        <div className="management-field">
          <label htmlFor="brand-name">{brandsCopy.form.brandName}</label>
          <input id="brand-name" name="brandName" value={form.brandName} onChange={handleChange} required />
        </div>

        <div className="management-field">
          <label htmlFor="brand-background-style">{brandsCopy.form.backgroundStyle}</label>
          <select id="brand-background-style" name="backgroundStyle" value={form.backgroundStyle} onChange={handleChange}>
            <option value="solid">{brandsCopy.form.solid}</option>
            <option value="linear-gradient">{brandsCopy.form.linearGradient}</option>
            <option value="radial-gradient">{brandsCopy.form.radialGradient}</option>
          </select>
        </div>

        {form.backgroundStyle === "solid" ? (
          <div className="management-field-grid">
            <ColorInputField
              id="brand-background-color"
              name="backgroundColor"
              label={brandsCopy.form.backgroundColor}
              value={form.backgroundColor}
              onChange={handleChange}
              placeholder="#38476d"
            />
            <ColorInputField
              id="brand-text-color"
              name="textColor"
              label={brandsCopy.form.textColor}
              value={form.textColor}
              onChange={handleChange}
              placeholder="#ffffff"
            />
          </div>
        ) : (
          <>
            <div className="management-field-grid">
              {form.backgroundStyle === "linear-gradient" ? (
                <div className="management-field">
                  <label htmlFor="brand-gradient-direction">{brandsCopy.form.gradientDirection}</label>
                  <div className="management-input-with-suffix">
                    <input
                      id="brand-gradient-direction"
                      name="gradientDirection"
                      type="text"
                      inputMode="numeric"
                      value={getGradientDirectionNumber(form.gradientDirection)}
                      onChange={handleGradientDirectionChange}
                      onKeyDown={handleGradientDirectionKeyDown}
                      placeholder="90"
                      required
                    />
                    <div className="management-input-controls">
                      <button
                        type="button"
                        className="management-input-step"
                        onClick={() => handleGradientDirectionStep(-1)}
                        aria-label={brandsCopy.form.decreaseGradientDirection}
                      >
                        -
                      </button>
                      <button
                        type="button"
                        className="management-input-step"
                        onClick={() => handleGradientDirectionStep(1)}
                        aria-label={brandsCopy.form.increaseGradientDirection}
                      >
                        +
                      </button>
                      <span className="management-input-suffix" aria-hidden="true">deg</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="management-field">
                  <label htmlFor="brand-gradient-position">{brandsCopy.form.gradientPosition}</label>
                  <select
                    id="brand-gradient-position"
                    name="gradientPosition"
                    value={form.gradientPosition}
                    onChange={handleChange}
                    required
                  >
                    {GRADIENT_POSITION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {brandsCopy.form.gradientPositions[option.value] || option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <ColorInputField
                id="brand-text-color"
                name="textColor"
                label={brandsCopy.form.textColor}
                value={form.textColor}
                onChange={handleChange}
                placeholder="#ffffff"
              />
            </div>

            <div className="management-field">
              <label htmlFor="brand-gradient-stops">{brandsCopy.form.gradientStops}</label>
              <textarea
                id="brand-gradient-stops"
                name="gradientStopsText"
                value={form.gradientStopsText}
                onChange={handleChange}
                placeholder={"#38476d 0%\n#020612 100%"}
                required
              />
            </div>
          </>
        )}

        <div className="management-actions">
          <button type="submit" className="management-button" disabled={busy}>
            {busy ? brandsCopy.form.saving : isEditing ? brandsCopy.form.saveEdit : brandsCopy.form.saveCreate}
          </button>
          {showCancel ? (
            <button type="button" className="management-button-secondary" onClick={onCancel} disabled={busy}>
              {brandsCopy.form.cancel}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
