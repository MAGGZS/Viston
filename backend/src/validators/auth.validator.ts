import { z } from 'zod';
import { senhaSchema } from './confirmation.validator';

// Tetos de tamanho em toda entrada de texto: bcrypt só lê 72 bytes, e um token
// de verdade tem poucas centenas de caracteres. O que passa disso não é uso.
export const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido').max(160),
  password: z.string().min(1, 'Senha obrigatória').max(200),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token obrigatório').max(2000),
});

// Cadastro público: nunca aceita `role`. Toda conta nasce igual, sem vínculo
// nenhum. O papel aparece depois, e sempre dentro de um prédio: criando um
// (vira gestor dele) ou sendo aprovado num pela chave de compartilhamento.
export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres').max(120),
    // A caixa é normalizada no serviço, não aqui: o índice `uq_users_email_lower`
    // e o `findByEmail` insensível passaram a tratar `Joao@x.com` e `joao@x.com`
    // como o mesmo endereço, que é o que impede duas contas do mesmo dono — as
    // duas com link de confirmação válido.
    email: z.string().trim().email('E-mail inválido').max(160),
    password: senhaSchema,
    // Armadilha. O campo é escondido no CSS e humano nenhum o preenche; robô de
    // formulário preenche tudo que encontra. Precisa estar declarado porque o
    // `.strict()` abaixo recusaria o campo desconhecido com 400 — e o 400 é
    // justamente o que ensinaria o robô a removê-lo da próxima vez.
    website: z.string().max(200).optional(),
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
// Os quatro papéis de vínculo: quem vistoria, quem só acompanha, quem recebe os
// chamados e quem os atende. Promover a gestor não passa por aqui, porque gestor
// é outro tipo de conta (ver POST /buildings/:id/managers).
export const updateMemberRoleSchema = z
  .object({
    role: z.enum(['INSPECTOR', 'VIEWER', 'MODERADOR', 'RESPONSAVEL'], {
      required_error: 'Papel deve ser INSPECTOR, VIEWER, MODERADOR ou RESPONSAVEL',
    }),
  })
  .strict();

// Só o nome. O e-mail saiu: trocá-lo aqui não passava por confirmação nenhuma,
// e qualquer sessão aberta (ou roubada) podia apontar a conta para outra caixa,
// ocupar o endereço de outra pessoa ou colidir com uma conta da outra tabela.
// O e-mail é a identidade da conta e a porta da recuperação de senha.
export const updateMeSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
  })
  .strict();

// Adicionar gestor ao prédio, pelo e-mail da conta dele.
export const addManagerSchema = z
  .object({
    email: z.string().trim().email('E-mail inválido').max(160),
  })
  .strict();

// A lista de solicitações só filtra pelos estados que existem.
export const accessRequestQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(200),
  new_password: senhaSchema,
});

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
