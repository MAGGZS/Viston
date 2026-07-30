const multer = require('multer');
const { AppError } = require('../utils/AppError');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new AppError('Tipo de arquivo não permitido. Use JPEG, PNG ou WebP.', 400));
    }
    cb(null, true);
  },
});

const uploadPhotos = upload.array('photos', 10);

module.exports = { uploadPhotos };
