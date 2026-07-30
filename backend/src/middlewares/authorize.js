const { AppError } = require('../utils/AppError');

function authorize(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new AppError('Acesso não autorizado', 403);
    }
    next();
  };
}

module.exports = { authorize };
