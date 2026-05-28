const express = require('express');
const { getBrands, getBrandById } = require('../controllers/brandController');

const router = express.Router();

router.get('/', getBrands);
router.get('/:id', getBrandById);

module.exports = router;
