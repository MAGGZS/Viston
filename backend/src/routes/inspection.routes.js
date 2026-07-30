const { Router } = require('express');
const {
  createInspection,
  saveFloorEntry,
  finishInspection,
  listInspections,
  getInspection,
  downloadPdf,
  downloadExcel,
} = require('../controllers/inspection.controller');
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');
const { uploadPhotos } = require('../middlewares/upload');

const router = Router();

router.use(authenticate);

router.post('/', authorize('ADMIN', 'INSPECTOR'), createInspection);
router.patch('/:id/floors/:floorId', authorize('ADMIN', 'INSPECTOR'), uploadPhotos, saveFloorEntry);
router.post('/:id/finish', authorize('ADMIN', 'INSPECTOR'), finishInspection);
router.get('/', listInspections);
router.get('/:id', getInspection);
router.get('/:id/pdf', downloadPdf);
router.get('/:id/excel', downloadExcel);

module.exports = router;
