import {
  createBrandService,
  deleteBrandService,
  getBrandByIdService,
  getBrandsService,
  updateBrandService,
} from "./brand.service.js";

export const createBrand = async (req, res) => {
  try {
    const brand = await createBrandService(req.body);

    return res.status(201).json({
      success: true,
      message: "Brand created successfully",
      data: brand,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getBrands = async (req, res) => {
  const brands = await getBrandsService();

  return res.json({
    success: true,
    data: brands,
  });
};

export const getBrand = async (req, res) => {
  try {
    const brand = await getBrandByIdService(req.params.id);

    return res.json({
      success: true,
      data: brand,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateBrand = async (req, res) => {
  try {
    const brand = await updateBrandService(req.params.id, req.body);

    return res.json({
      success: true,
      message: "Brand updated successfully",
      data: brand,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteBrand = async (req, res) => {
  try {
    await deleteBrandService(req.params.id);

    return res.json({
      success: true,
      message: "Brand deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
