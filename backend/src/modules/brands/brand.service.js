import Brand from "./brand.model.js";

const formatBrandName = (brandName) => brandName.trim().replace(/\s+/g, " ");
const buildBrandSlug = (brandName) =>
  formatBrandName(brandName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const extractColorToken = (stop) => {
  const value = String(stop).trim();
  const rgbMatch = value.match(/^(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]+)\b/);

  if (rgbMatch) {
    return rgbMatch[1];
  }

  return value.split(/\s+/)[0];
};

const buildBackgroundCss = ({ backgroundStyle, backgroundColor, gradientDirection, gradientPosition, gradientStops }) => {
  if (backgroundStyle === "solid") {
    return backgroundColor;
  }

  if (backgroundStyle === "linear-gradient") {
    return `linear-gradient(${gradientDirection}, ${gradientStops.join(", ")})`;
  }

  if (backgroundStyle === "radial-gradient") {
    return `radial-gradient(${gradientPosition}, ${gradientStops.join(", ")})`;
  }

  throw new Error("Unsupported background style");
};

const sanitizeBrandPayload = (payload, { partial = false } = {}) => {
  const sanitized = {};

  if (!partial || payload.brandName !== undefined) {
    if (!payload.brandName?.trim()) {
      throw new Error("Brand name is required");
    }

    sanitized.brandName = formatBrandName(payload.brandName);
  }

  if (!partial || payload.cssClassName !== undefined) {
    const brandNameSource = sanitized.brandName ?? payload.brandName ?? "";
    const className =
      payload.cssClassName?.trim() ||
      `brand-${buildBrandSlug(brandNameSource)}`;

    if (!className) {
      throw new Error("Brand CSS class name is required");
    }

    sanitized.cssClassName = className;
  }

  if (!partial || payload.backgroundStyle !== undefined) {
    if (!payload.backgroundStyle) {
      throw new Error("Background style is required");
    }

    sanitized.backgroundStyle = payload.backgroundStyle;
  }

  if (payload.backgroundColor !== undefined) {
    sanitized.backgroundColor = payload.backgroundColor?.trim() || null;
  }

  if (payload.gradientType !== undefined) {
    sanitized.gradientType = payload.gradientType || null;
  }

  if (payload.gradientDirection !== undefined) {
    sanitized.gradientDirection = payload.gradientDirection?.trim() || null;
  }

  if (payload.gradientPosition !== undefined) {
    sanitized.gradientPosition = payload.gradientPosition?.trim() || null;
  }

  if (payload.gradientStops !== undefined) {
    if (!Array.isArray(payload.gradientStops)) {
      throw new Error("Gradient stops must be an array");
    }

    sanitized.gradientStops = payload.gradientStops
      .map((stop) => String(stop).trim())
      .filter(Boolean);
  }

  if (payload.gradientColors !== undefined) {
    if (!Array.isArray(payload.gradientColors)) {
      throw new Error("Gradient colors must be an array");
    }

    sanitized.gradientColors = payload.gradientColors
      .map((color) => String(color).trim())
      .filter(Boolean);
  }

  if (!partial || payload.textColor !== undefined) {
    if (!payload.textColor?.trim()) {
      throw new Error("Text color is required");
    }

    sanitized.textColor = payload.textColor.trim();
  }

  if ((sanitized.backgroundStyle || payload.backgroundStyle) === "solid") {
    const solidColor = sanitized.backgroundColor ?? payload.backgroundColor?.trim();

    if (!solidColor) {
      throw new Error("Background color is required for solid brands");
    }

    sanitized.gradientType = null;
    sanitized.gradientDirection = null;
    sanitized.gradientPosition = null;
    sanitized.gradientStops = [];
    sanitized.gradientColors = [];
    sanitized.backgroundCss = buildBackgroundCss({
      backgroundStyle: "solid",
      backgroundColor: solidColor,
    });
  }

  const effectiveStyle = sanitized.backgroundStyle || payload.backgroundStyle;

  if (effectiveStyle === "linear-gradient" || effectiveStyle === "radial-gradient") {
    const gradientStops = sanitized.gradientStops ?? payload.gradientStops ?? [];

    if (!Array.isArray(gradientStops) || gradientStops.length < 2) {
      throw new Error("At least two gradient stops are required for gradient brands");
    }

    sanitized.backgroundColor = null;
    sanitized.gradientType = effectiveStyle === "linear-gradient" ? "linear" : "radial";
    sanitized.gradientStops = gradientStops;
    sanitized.gradientColors =
      payload.gradientColors !== undefined
        ? sanitized.gradientColors
        : gradientStops.map(extractColorToken);

    if (effectiveStyle === "linear-gradient" && !(sanitized.gradientDirection ?? payload.gradientDirection)) {
      throw new Error("Gradient direction is required for linear gradients");
    }

    if (effectiveStyle === "radial-gradient" && !(sanitized.gradientPosition ?? payload.gradientPosition)) {
      throw new Error("Gradient position is required for radial gradients");
    }

    sanitized.backgroundCss = buildBackgroundCss({
      backgroundStyle: effectiveStyle,
      gradientDirection: sanitized.gradientDirection ?? payload.gradientDirection,
      gradientPosition: sanitized.gradientPosition ?? payload.gradientPosition,
      gradientStops,
    });
  }

  return sanitized;
};

const ensureUniqueBrand = async ({ brandName }, excludeId = null) => {
  const query = excludeId ? { _id: { $ne: excludeId } } : {};
  const brands = await Brand.find(query).select("brandName");

  const brandNameConflict = brands.find(
    (brand) => brand.brandName.toLowerCase() === brandName.toLowerCase()
  );

  if (brandNameConflict) {
    throw new Error("Brand name already exists");
  }
};

export const createBrandService = async (payload) => {
  const sanitized = sanitizeBrandPayload(payload);
  await ensureUniqueBrand(sanitized);
  return Brand.create(sanitized);
};

export const getBrandsService = async () => {
  return Brand.find().sort({ brandName: 1 });
};

export const getBrandByIdService = async (id) => {
  const brand = await Brand.findById(id);

  if (!brand) {
    throw new Error("Brand not found");
  }

  return brand;
};

export const updateBrandService = async (id, payload) => {
  const brand = await Brand.findById(id);

  if (!brand) {
    throw new Error("Brand not found");
  }

  const mergedPayload = {
    brandName: payload.brandName ?? brand.brandName,
    cssClassName: payload.cssClassName ?? brand.cssClassName,
    backgroundStyle: payload.backgroundStyle ?? brand.backgroundStyle,
    backgroundColor: payload.backgroundColor ?? brand.backgroundColor,
    gradientType: payload.gradientType ?? brand.gradientType,
    gradientDirection: payload.gradientDirection ?? brand.gradientDirection,
    gradientPosition: payload.gradientPosition ?? brand.gradientPosition,
    gradientStops: payload.gradientStops ?? brand.gradientStops,
    gradientColors: payload.gradientColors ?? brand.gradientColors,
    textColor: payload.textColor ?? brand.textColor,
  };

  const sanitized = sanitizeBrandPayload(mergedPayload);
  await ensureUniqueBrand(sanitized, id);

  Object.assign(brand, sanitized);
  await brand.save();

  return brand;
};

export const deleteBrandService = async (id) => {
  const brand = await Brand.findById(id);

  if (!brand) {
    throw new Error("Brand not found");
  }

  await brand.deleteOne();
};
