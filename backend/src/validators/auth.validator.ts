import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token obrigatório'),
});

// Cadastro público: nunca aceita `role`. O papel sai sempre como VIEWER e só um
// ADMIN pode promover depois, via PATCH /users/:id.
export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres').max(120),
    // Sem normalizar caixa: o banco já tem contas gravadas como digitadas e
    // `findUnique` no Postgres é case-sensitive — mudar aqui quebraria logins.
    email: z.string().trim().email('E-mail inválido').max(160),
    password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres').max(200),
  })
  .strict();

export const updateUserSchema = z.object({
  role: z.enum(['ADMIN', 'INSPECTOR', 'VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'DELETED']).optional(),
});

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(160).optional(),
  })
  .strict();

// Aprovação/recusa de solicitação de acesso a um prédio.
export const reviewAccessRequestSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED'], {
      required_error: 'Status deve ser APPROVED ou REJECTED',
    }),
  })
  .strict();

// ── Prédios ───────────────────────────────────────────────────────────────────
export const createBuildingSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres').max(160),
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export const updateBuildingSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export const createFloorSchema = z
  .object({
    label: z.string().trim().min(1, 'Rótulo do andar é obrigatório').max(60),
  })
  .strict();

export const accessRequestSchema = z
  .object({
    key: z.string().trim().min(1, 'Chave de compartilhamento é obrigatória').max(40),
  })
  .strict();

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'Nova senha deve ter ao menos 8 caracteres'),
});
