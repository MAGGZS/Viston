const { Router } = require('express');
const { login, refresh, forgotPassword } = require('../controllers/auth.controller');

const router = Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/forgot-password', forgotPassword);

module.exports = router;
