import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token obrigatório'),
});

export const createUserSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  role: z.enum(['ADMIN', 'INSPECTOR', 'VIEWER']),
});

export const updateUserSchema = z.object({
  role: z.enum(['ADMIN', 'INSPECTOR', 'VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'DELETED']).optional(),
});

export const updateMeSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'Nova senha deve ter ao menos 8 caracteres'),
});
