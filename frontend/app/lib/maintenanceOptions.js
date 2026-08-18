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

// A lista fixa de responsáveis ("Alan", "Gislaine", ...) saiu daqui: eram nomes
// que não correspondiam a conta nenhuma. Responsável virou papel de prédio, e o
// droplist do formulário recebe as contas com esse papel naquele prédio — ver
// `useBuildingResponsibles`.

// Onde o chamado está. O formulário não escolhe mais: a ocorrência nasce
// ABERTA, e daí em diante quem move é o moderador (e o responsável, que só
// consegue dizer "terminei").
export const RECORD_STATUS = [
  { value: 'ABERTO', label: 'Aberto' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'AGUARDANDO_TERCEIRO', label: 'Aguardando terceiro' },
  { value: 'AGUARDANDO_FECHAMENTO', label: 'Concluído pelo responsável' },
  { value: 'CONCLUIDO', label: 'Concluído' },
];

/** Cor do estado do chamado nas listas — a mesma leitura das três telas. */
export const RECORD_STATUS_VARIANT = {
  ABERTO: 'warning',
  EM_ANDAMENTO: 'accent',
  AGUARDANDO_TERCEIRO: 'accent',
  AGUARDANDO_FECHAMENTO: 'accent',
  CONCLUIDO: 'success',
};

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
    // Vazio é um estado válido: o chamado nasce sem dono e o moderador o
    // encaminha.
    responsible_id: '',
  };
}

/** Valor em reais como o produto o escreve. Nulo vira travessão. */
export function formatCost(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return '—';
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
