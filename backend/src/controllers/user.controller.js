const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../utils/prisma');
const { AppError } = require('../utils/AppError');

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'INSPECTOR', 'VIEWER']),
});

const updateUserSchema = z.object({
  role: z.enum(['ADMIN', 'INSPECTOR', 'VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'DELETED']).optional(),
});

const updateMeSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

const SAFE_USER_SELECT = {
  id: true, name: true, email: true, role: true,
  avatarUrl: true, status: true, createdAt: true,
};

async function listUsers(_req, res) {
  const users = await prisma.user.findMany({
    select: SAFE_USER_SELECT,
    orderBy: { createdAt: 'desc' },
  });
  return res.json(users);
}

async function createUser(req, res) {
  const data = createUserSchema.parse(req.body);

  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) throw new AppError('E-mail já cadastrado', 409);

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, passwordHash, role: data.role },
    select: SAFE_USER_SELECT,
  });

  return res.status(201).json(user);
}

async function updateUser(req, res) {
  const data = updateUserSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: SAFE_USER_SELECT,
  });
  return res.json(user);
}

async function getMe(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: SAFE_USER_SELECT,
  });
  if (!user) throw new AppError('Usuário não encontrado', 404);
  return res.json(user);
}

async function updateMe(req, res) {
  const data = updateMeSchema.parse(req.body);

  if (data.email) {
    const exists = await prisma.user.findFirst({
      where: { email: data.email, NOT: { id: req.user.sub } },
    });
    if (exists) throw new AppError('E-mail já em uso', 409);
  }

  const user = await prisma.user.update({
    where: { id: req.user.sub },
    data,
    select: SAFE_USER_SELECT,
  });
  return res.json(user);
}

async function updatePassword(req, res) {
  const { currentPassword, newPassword } = updatePasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new AppError('Senha atual incorreta', 400);

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: req.user.sub }, data: { passwordHash } });

  return res.json({ message: 'Senha atualizada com sucesso' });
}

async function deleteMe(req, res) {
  await prisma.user.update({
    where: { id: req.user.sub },
    data: {
      name: 'Usuário removido',
      email: `deleted_${req.user.sub}@removed.invalid`,
      avatarUrl: null,
      status: 'DELETED',
    },
  });
  return res.json({ message: 'Conta removida com sucesso' });
}

module.exports = { listUsers, createUser, updateUser, getMe, updateMe, updatePassword, deleteMe };
