const { Router } = require('express');
const { getCalendar } = require('../controllers/calendar.controller');
const { authenticate } = require('../middlewares/authenticate');

const router = Router();

router.use(authenticate);
router.get('/', getCalendar);

module.exports = router;
