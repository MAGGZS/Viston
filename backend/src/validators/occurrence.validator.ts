import { z } from 'zod';

export const createOccurrenceSchema = z
  .object({
    floor_id: z.string().uuid('Andar inválido'),
    maintenance_type: z.enum(
      [
        'AR_CONDICIONADO',
        'CIVIL',
        'ELETRICA',
        'EQUIPAMENTO',
        'EVENTOS',
        'HIDRELETRICA',
        'HIGIENIZACAO_LIMPEZA',
        'INFILTRACAO',
        'MARCENARIA',
        'MOVEIS_CADEIRAS',
        'PINTURA',
        'PROJETOR',
        'VAZAMENTO',
      ],
      { required_error: 'Tipo de manutenção é obrigatório' }
    ),
    category: z.enum(['PREVENTIVA', 'CORRETIVA', 'EMERGENCIAL', 'EVENTOS', 'PROJETOS'], {
      required_error: 'Categoria é obrigatória',
    }),
    priority: z.enum(['ALTA', 'MEDIA', 'BAIXA'], { required_error: 'Prioridade é obrigatória' }),
    description: z.string().trim().min(1, 'Escreva a descrição do problema').max(2000, 'Descrição muito longa'),
    photos: z
      .array(
        z
          .string()
          .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, 'Formato de imagem inválido')
          .max(2_100_000, 'Imagem muito grande')
      )
      .max(4, 'No máximo 4 fotos por ocorrência')
      .default([]),
  })
  .strict();

export type CreateOccurrencePayload = z.infer<typeof createOccurrenceSchema>;
