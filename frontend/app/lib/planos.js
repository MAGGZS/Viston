/**
 * O catálogo dos planos, como a tela o mostra.
 *
 * Os números vivem no backend (`src/utils/plans.ts`), que é quem decide quem
 * pode o quê — aqui está a versão que a pessoa lê antes de escolher. Os dois
 * precisam concordar, e é de propósito que só um deles manda: uma divergência
 * aqui mostra o preço errado; uma divergência lá cobraria errado.
 *
 * Os preços são os do painel do Stripe, e não são cobrados a partir daqui: a
 * sessão de pagamento usa as chaves de preço do servidor. O que está escrito
 * nesta tela é vitrine.
 */
export const PLANOS = [
  {
    code: 'LIVRE',
    nome: 'Livre',
    resumo: 'Para conhecer o Viston com um prédio.',
    preco: { MONTHLY: 0, YEARLY: 0 },
    limites: [
      '1 prédio',
      '1 gestor por prédio',
      '1 inspetor, 1 responsável e 1 visualizador',
      '1 GB de fotos',
      '100 e-mails por mês',
    ],
    recursos: [],
  },
  {
    code: 'ESSENCIAL',
    nome: 'Essencial',
    resumo: 'Para quem administra um prédio de verdade, com equipe.',
    preco: { MONTHLY: 79, YEARLY: 790 },
    limites: [
      '1 prédio incluso, até 2 extras',
      'Pessoas ilimitadas em todos os papéis',
      '20 GB de fotos',
      '2.000 e-mails por mês',
    ],
    recursos: ['Moderador de chamados', 'Exportar para CSV', 'Dois fatores'],
  },
  {
    code: 'PRO',
    nome: 'Pro',
    resumo: 'Para administradoras com vários prédios.',
    preco: { MONTHLY: 249, YEARLY: 2490 },
    limites: [
      '5 prédios inclusos, até 20 extras',
      'Pessoas ilimitadas em todos os papéis',
      '150 GB de fotos',
      '20.000 e-mails por mês',
    ],
    recursos: [
      'Tudo do Essencial',
      'Marca própria nos relatórios',
      'Carteira de manutenção',
      'Acesso por API',
    ],
  },
];

/** O nome do plano, para quando só o código está em mãos. */
export function nomeDoPlano(code) {
  return PLANOS.find((p) => p.code === code)?.nome ?? 'Livre';
}

/**
 * O que cada status de assinatura quer dizer para quem lê.
 *
 * `PAST_DUE` é o que mais importa acertar: a cobrança falhou e o acesso
 * continua de pé por alguns dias. Dizer "sem acesso" ali assustaria quem só
 * precisa trocar o cartão.
 */
export const STATUS_LABEL = {
  TRIALING: 'Em teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  CANCELED: 'Cancelada',
  INCOMPLETE: 'Aguardando pagamento',
  UNPAID: 'Não paga',
};

/** Em reais, sem centavos quando não há centavos. */
export function emReais(valor) {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
