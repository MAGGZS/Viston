const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/AppError');

function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) throw new AppError('Token não fornecido', 401);

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    throw new AppError('Token inválido ou expirado', 401);
  }
}

module.exports = { authenticate };
