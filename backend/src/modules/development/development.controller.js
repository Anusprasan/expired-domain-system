import {
  acquireDevelopmentContentLockService,
  assignDevelopmentDomainService,
  createDevelopmentDomainService,
  createDevelopmentTemplateService,
  deleteDevelopmentDomainService,
  deleteDevelopmentTemplateService,
  getAssignableDevelopersService,
  getDevelopmentDomainByIdService,
  getDevelopmentDomainsService,
  getDevelopmentTemplatesService,
  releaseDevelopmentContentLockService,
  updateDevelopmentDomainService,
  updateDevelopmentProgressService,
  updateDevelopmentTemplateService,
} from "./development.service.js";

export const getDevelopmentDomains = async (req, res) => {
  try {
    const domains = await getDevelopmentDomainsService(req.query, req.user);

    return res.json({
      success: true,
      data: domains,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getDevelopmentDomain = async (req, res) => {
  try {
    const domain = await getDevelopmentDomainByIdService(req.params.id, req.user);

    return res.json({
      success: true,
      data: domain,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const createDevelopmentDomain = async (req, res) => {
  try {
    const domain = await createDevelopmentDomainService(req.body, req.user._id);

    return res.status(201).json({
      success: true,
      message: "Development domain created successfully",
      data: domain,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateDevelopmentDomain = async (req, res) => {
  try {
    const domain = await updateDevelopmentDomainService(req.params.id, req.body, req.user);

    return res.json({
      success: true,
      message: "Development domain updated successfully",
      data: domain,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const assignDevelopmentDomain = async (req, res) => {
  try {
    const domain = await assignDevelopmentDomainService(
      req.params.id,
      { developerId: req.body.developerId },
      req.user._id
    );

    return res.json({
      success: true,
      message: "Development domain assigned successfully",
      data: domain,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const acquireDevelopmentContentLock = async (req, res) => {
  try {
    const domain = await acquireDevelopmentContentLockService(req.params.id, req.user);

    return res.json({
      success: true,
      message: "Content lock acquired successfully",
      data: domain,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const releaseDevelopmentContentLock = async (req, res) => {
  try {
    const domain = await releaseDevelopmentContentLockService(req.params.id, req.user);

    return res.json({
      success: true,
      message: "Content lock released successfully",
      data: domain,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateDevelopmentProgress = async (req, res) => {
  try {
    const domain = await updateDevelopmentProgressService(req.params.id, req.body, req.user);

    return res.json({
      success: true,
      message: "Development progress updated successfully",
      data: domain,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteDevelopmentDomain = async (req, res) => {
  try {
    await deleteDevelopmentDomainService(req.params.id);

    return res.json({
      success: true,
      message: "Development domain deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getDevelopmentTemplates = async (req, res) => {
  try {
    const templates = await getDevelopmentTemplatesService();

    return res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const createDevelopmentTemplate = async (req, res) => {
  try {
    const template = await createDevelopmentTemplateService(req.body, req.user._id);

    return res.status(201).json({
      success: true,
      message: "Development info created successfully",
      data: template,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateDevelopmentTemplate = async (req, res) => {
  try {
    const template = await updateDevelopmentTemplateService(req.params.id, req.body);

    return res.json({
      success: true,
      message: "Development info updated successfully",
      data: template,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteDevelopmentTemplate = async (req, res) => {
  try {
    await deleteDevelopmentTemplateService(req.params.id);

    return res.json({
      success: true,
      message: "Development info deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getAssignableDevelopers = async (req, res) => {
  try {
    const developers = await getAssignableDevelopersService();

    return res.json({
      success: true,
      data: developers,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
