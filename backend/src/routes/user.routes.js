const { Router } = require('express');
const {
  listUsers,
  createUser,
  updateUser,
  getMe,
  updateMe,
  updatePassword,
  deleteMe,
} = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');

const router = Router();

router.use(authenticate);

router.get('/me', getMe);
router.patch('/me', updateMe);
router.patch('/me/password', updatePassword);
router.delete('/me', deleteMe);

router.get('/', authorize('ADMIN'), listUsers);
router.post('/', authorize('ADMIN'), createUser);
router.patch('/:id', authorize('ADMIN'), updateUser);

module.exports = router;
