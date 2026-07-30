const { Router } = require('express');
const { getFloors } = require('../controllers/building.controller');
const { authenticate } = require('../middlewares/authenticate');

const router = Router();

router.use(authenticate);
router.get('/:id/floors', getFloors);

module.exports = router;
