const Domain = require('../models/Domain');
const { DomainActivityLog, DOMAIN_ACTIVITY_ACTIONS } = require('../models/DomainActivityLog');
const { attachBrands, findBrandById } = require('../services/systemBrandService');
const { normalizeDomain } = require('../utils/domain');

const getDomains = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.brandId) {
      filter.brand = req.query.brandId;
    }
    if (req.query.active === 'true') {
      filter.isActive = true;
    }

    const domains = await Domain.find(filter).sort({ domain: 1 }).lean();
    res.json(await attachBrands(domains));
  } catch (error) {
    next(error);
  }
};

const createDomain = async (req, res, next) => {
  try {
    const rawDomain = String(req.body.domain || '').trim();
    const note = String(req.body.note || '').trim();
    const brandId = String(req.body.brandId || '').trim();

    if (!rawDomain || !brandId) {
      return res.status(400).json({ error: 'domain and brandId are required' });
    }

    const normalizedDomain = normalizeDomain(rawDomain);
    if (!normalizedDomain) {
      return res.status(400).json({ error: 'Invalid domain' });
    }

    const brand = await findBrandById(brandId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const domain = await Domain.create({
      domain: normalizedDomain,
      brand: brand._id,
      note,
      isActive: true,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    await DomainActivityLog.create({
      action: DOMAIN_ACTIVITY_ACTIONS.ADD,
      domain: domain.domain,
      domainHostKey: domain.domainHostKey,
      note: domain.note,
      brand: domain.brand,
      actor: req.user._id,
    });

    const createdDomain = await Domain.findById(domain._id).lean();
    const [populated] = await attachBrands([createdDomain]);
    return res.status(201).json(populated);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Domain already exists for this brand' });
    }
    return next(error);
  }
};

const deleteDomain = async (req, res, next) => {
  try {
    const domain = await Domain.findById(req.params.id);
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    await DomainActivityLog.create({
      action: DOMAIN_ACTIVITY_ACTIONS.DELETE,
      domain: domain.domain,
      domainHostKey: domain.domainHostKey,
      note: domain.note,
      brand: domain.brand,
      actor: req.user._id,
    });

    await domain.deleteOne();
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getDomains,
  createDomain,
  deleteDomain,
};
