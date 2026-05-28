const express = require('express');
const { getDomains, createDomain, deleteDomain } = require('../controllers/domainController');

const router = express.Router();

router.get('/', getDomains);
router.post('/', createDomain);
router.delete('/:id', deleteDomain);

module.exports = router;
