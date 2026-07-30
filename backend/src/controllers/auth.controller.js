const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../utils/prisma');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/tokens');
const { AppError } = require('../utils/AppError');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function login(req, res) {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status === 'DELETED') throw new AppError('Credenciais inválidas', 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('Credenciais inválidas', 401);

  const payload = { sub: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl },
  });
}

async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new AppError('Refresh token não fornecido', 400);

  const payload = verifyRefreshToken(refreshToken);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status === 'DELETED') throw new AppError('Usuário não encontrado', 401);

  const newPayload = { sub: user.id, role: user.role };
  return res.json({
    accessToken: signAccessToken(newPayload),
    refreshToken: signRefreshToken(newPayload),
  });
}

async function forgotPassword(req, res) {
  // Placeholder — implement email sending when SMTP is configured
  return res.json({ message: 'Se o e-mail existir, você receberá as instruções.' });
}

module.exports = { login, refresh, forgotPassword };
