/** Rótulos em português das opções do formulário de vistoria (usados no Excel). */

export const MAINTENANCE_TYPE_LABEL: Record<string, string> = {
  AR_CONDICIONADO: 'Ar condicionado',
  CIVIL: 'Civil',
  ELETRICA: 'Elétrica',
  EQUIPAMENTO: 'Equipamento',
  EVENTOS: 'Eventos',
  HIDRELETRICA: 'Hidrelétrica',
  HIGIENIZACAO_LIMPEZA: 'Higienização/Limpeza',
  INFILTRACAO: 'Infiltração',
  MARCENARIA: 'Marcenaria',
  MOVEIS_CADEIRAS: 'Móveis/Cadeiras',
  PINTURA: 'Pintura',
  PROJETOR: 'Projetor',
  VAZAMENTO: 'Vazamento',
};

export const CATEGORY_LABEL: Record<string, string> = {
  PREVENTIVA: 'Preventiva',
  CORRETIVA: 'Corretiva',
  EMERGENCIAL: 'Emergencial',
  EVENTOS: 'Eventos',
  PROJETOS: 'Projetos',
};

export const PRIORITY_LABEL: Record<string, string> = {
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
};

export const RECORD_STATUS_LABEL: Record<string, string> = {
  ABERTO: 'Aberto',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_TERCEIRO: 'Aguardando terceiro',
  CONCLUIDO: 'Concluído',
};

/** Responsáveis disponíveis no droplist do formulário. */
export const RESPONSIBLES = [
  'Alan',
  'Ailton',
  'Gislaine',
  'Gustavo',
  'Rossi',
  'Felipe',
  'Vanessa',
] as const;
