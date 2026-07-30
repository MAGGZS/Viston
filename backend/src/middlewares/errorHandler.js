const { AppError } = require('../utils/AppError');

function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Dados inválidos',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  console.error(err);
  return res.status(500).json({ error: 'Erro interno do servidor' });
}

module.exports = { errorHandler };
