// Opções do formulário de vistoria — espelham os enums do backend.

export const MAINTENANCE_TYPES = [
  { value: 'AR_CONDICIONADO', label: 'Ar condicionado' },
  { value: 'CIVIL', label: 'Civil' },
  { value: 'ELETRICA', label: 'Elétrica' },
  { value: 'EQUIPAMENTO', label: 'Equipamento' },
  { value: 'EVENTOS', label: 'Eventos' },
  { value: 'HIDRELETRICA', label: 'Hidrelétrica' },
  { value: 'HIGIENIZACAO_LIMPEZA', label: 'Higienização/Limpeza' },
  { value: 'INFILTRACAO', label: 'Infiltração' },
  { value: 'MARCENARIA', label: 'Marcenaria' },
  { value: 'MOVEIS_CADEIRAS', label: 'Móveis/Cadeiras' },
  { value: 'PINTURA', label: 'Pintura' },
  { value: 'PROJETOR', label: 'Projetor' },
  { value: 'VAZAMENTO', label: 'Vazamento' },
];

export const CATEGORIES = [
  { value: 'PREVENTIVA', label: 'Preventiva' },
  { value: 'CORRETIVA', label: 'Corretiva' },
  { value: 'EMERGENCIAL', label: 'Emergencial' },
  { value: 'EVENTOS', label: 'Eventos' },
  { value: 'PROJETOS', label: 'Projetos' },
];

export const PRIORITIES = [
  { value: 'ALTA', label: 'Alta' },
  { value: 'MEDIA', label: 'Média' },
  { value: 'BAIXA', label: 'Baixa' },
];

export const RESPONSIBLES = ['Alan', 'Ailton', 'Gislaine', 'Gustavo', 'Rossi', 'Felipe', 'Vanessa']
  .map((name) => ({ value: name, label: name }));

export const RECORD_STATUS = [
  { value: 'ABERTO', label: 'Aberto' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'AGUARDANDO_TERCEIRO', label: 'Aguardando terceiro' },
  { value: 'CONCLUIDO', label: 'Concluído' },
];

/** Rótulo legível de um valor de enum; devolve o próprio valor se não conhecer. */
export function labelOf(options, value) {
  return options.find((o) => o.value === value)?.label ?? value ?? '—';
}

/** Registro em branco usado ao abrir o formulário e ao adicionar mais informações. */
export function emptyRecord() {
  return {
    maintenance_type: '',
    category: '',
    priority: '',
    description: '',
    responsible: '',
    status: 'ABERTO',
  };
}
