import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token obrigatório'),
});

// Cadastro público: nunca aceita `role`. Toda conta nasce igual, sem vínculo
// nenhum. O papel aparece depois, e sempre dentro de um prédio: criando um
// (vira gestor dele) ou sendo aprovado num pela chave de compartilhamento.
export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres').max(120),
    // Sem normalizar caixa: o banco já tem contas gravadas como digitadas e
    // `findUnique` no Postgres é case-sensitive — mudar aqui quebraria logins.
    email: z.string().trim().email('E-mail inválido').max(160),
    password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres').max(200),
  })
  .strict();

// Edição pelo ADMIN: nome e status. O papel não entra aqui — quem define o
// nível de acesso é o gestor do prédio, em PATCH /buildings/:id/members/:userId.
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres').max(120).optional(),
    status: z.enum(['ACTIVE', 'DELETED']).optional(),
  })
  .strict();

// Troca do papel de um membro dentro do prédio, feita por um gestor dele.
//
// Só INSPECTOR e VIEWER: promover a gestor não passa por aqui, porque gestor é
// outro tipo de conta (ver POST /buildings/:id/managers).
export const updateMemberRoleSchema = z
  .object({
    role: z.enum(['INSPECTOR', 'VIEWER'], {
      required_error: 'Papel deve ser INSPECTOR ou VIEWER',
    }),
  })
  .strict();

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

/**
 * Foto de perfil, já recortada pelo app e enviada como data URL.
 *
 * O recorte acontece no cliente (círculo de 512px), então o que chega aqui é
 * uma imagem pequena — o teto de 1,5 MB é folga, não expectativa. Só os três
 * formatos que o `<canvas>` exporta entram.
 */
export const updateAvatarSchema = z
  .object({
    image: z
      .string()
      .regex(
        /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
        'Formato de imagem inválido'
      )
      .max(2_100_000, 'Imagem muito grande'),
  })
  .strict();

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'Nova senha deve ter ao menos 8 caracteres'),
});
