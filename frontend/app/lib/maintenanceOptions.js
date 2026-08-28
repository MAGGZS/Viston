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
  { value: 'ENCAMINHADO', label: 'Encaminhado' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'AGUARDANDO_TERCEIRO', label: 'Aguardando terceiro' },
  { value: 'AGUARDANDO_FECHAMENTO', label: 'Concluído pelo responsável' },
  { value: 'CONCLUIDO', label: 'Concluído' },
];

/** Cor do estado do chamado nas listas — a mesma leitura de todas as telas. */
export const RECORD_STATUS_VARIANT = {
  ABERTO: 'warning',
  // Encaminhado é o que espera aceite, e amarelo é a cor do que ainda cobra
  // alguém — o que já anda fica no cinza dos demais.
  ENCAMINHADO: 'warning',
  EM_ANDAMENTO: 'accent',
  AGUARDANDO_TERCEIRO: 'accent',
  AGUARDANDO_FECHAMENTO: 'accent',
  CONCLUIDO: 'success',
};

/**
 * O mesmo estado, dito curto — o histórico de ocorrências.
 *
 * Quem lê o histórico não trabalha o chamado: para essa pessoa "aguardando
 * terceiro" e "concluído pelo responsável" são o mesmo "em andamento", e a
 * diferença entre eles só interessa a quem tem de agir.
 */
export const OCCURRENCE_STATUS_LABEL = {
  ABERTO: 'Em aberto',
  ENCAMINHADO: 'Encaminhado',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_TERCEIRO: 'Em andamento',
  AGUARDANDO_FECHAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluída',
};

/**
 * Como o andar saiu da vistoria.
 *
 * Não vem do formulário: o backend o deriva da maior prioridade entre as
 * ocorrências daquele andar (ver `deriveFloorStatus`) — alta vira problema,
 * média vira atenção, e andar sem nada relatado fica OK.
 */
export const FLOOR_STATUS_LABEL = { OK: 'OK', ATENCAO: 'Atenção', PROBLEMA: 'Problema' };

export const FLOOR_STATUS_VARIANT = { OK: 'success', ATENCAO: 'warning', PROBLEMA: 'danger' };

/** Do mais brando ao mais grave — a ordem que decide qual andar fala pela vistoria. */
const FLOOR_STATUS_SEVERITY = { OK: 0, ATENCAO: 1, PROBLEMA: 2 };

/**
 * Como a vistoria inteira saiu: o pior dos andares dela.
 *
 * Uma vistoria de dez andares em que um tem infiltração grave não é uma vistoria
 * OK — e é justamente esse andar que alguém precisa achar na lista. A regra é a
 * mesma que o relatório do dia já usa para juntar vistorias do mesmo prédio.
 */
export function worstFloorStatus(entries = []) {
  return entries.reduce(
    (pior, entry) =>
      (FLOOR_STATUS_SEVERITY[entry?.status_geral] ?? 0) > (FLOOR_STATUS_SEVERITY[pior] ?? 0)
        ? entry.status_geral
        : pior,
    'OK'
  );
}

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
