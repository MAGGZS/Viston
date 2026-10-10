/**
 * A mensagem que a pessoa lê quando o servidor diz não.
 *
 * O backend já manda a frase pronta em `error.message`, e é ela que vale — quem
 * escreve a regra escreve a explicação dela, e duplicar o texto aqui garantiria
 * que um dia os dois discordassem.
 *
 * O que esta função acrescenta é o que só a tela sabe fazer: transformar
 * `error.details` em número legível ("3 de 3 prédios") e apontar para onde
 * resolve. Sem isso, "seu plano comporta 3 prédios" deixa a pessoa procurando
 * sozinha a tela de planos.
 */
import { useUpgradeModalStore } from '@/app/store/upgradeModal';

const PADRAO = 'Não foi possível concluir. Tente de novo em instantes.';

export function mensagemDoErro(err, fallback = PADRAO) {
  const data = err?.response?.data?.error;
  if (Array.isArray(data?.details) && data.details.length > 0 && data.details[0]?.message) {
    return data.details[0].message;
  }
  return data?.message ?? fallback;
}

/** O código do erro, quando a tela precisa decidir o que mostrar ao lado. */
export function codigoDoErro(err) {
  return err?.response?.data?.error?.code ?? null;
}

/**
 * Os erros de plano levam a um lugar só: a tela de planos.
 *
 * `PREDIO_CONGELADO` também, e de propósito — prédio inativo por plano se
 * resolve assinando, e prédio inativo por transferência recusada precisa do
 * suporte, que é o que a tela de planos explica.
 */
const CODIGOS_DE_PLANO = ['LIMITE_DO_PLANO', 'RECURSO_DO_PLANO', 'PREDIO_CONGELADO'];

export function ehErroDePlano(err) {
  return CODIGOS_DE_PLANO.includes(codigoDoErro(err));
}

/**
 * O detalhe do limite, em uma frase.
 *
 * `null` quando não há o que acrescentar — a mensagem do servidor já basta, e
 * uma segunda linha vazia só empurraria o resto da caixa para baixo.
 */
export function detalheDoLimite(err) {
  const detalhes = err?.response?.data?.error?.details;
  if (!detalhes || typeof detalhes.current !== 'number' || typeof detalhes.limit !== 'number') {
    return null;
  }
  return `Você está usando ${detalhes.current} de ${detalhes.limit}.`;
}

/**
 * Trata a notificação ou modal de um erro.
 *
 * Nos erros de plano (limites, recursos bloqueados, prédio inativo), abre
 * diretamente o modal de sugestão de upgrade comercial, sem poluir a tela
 * com toast de erro de sistema ou link técnico de "ver log".
 *
 * Nos erros comuns de aplicação, mantém o toast com mensagem clara e detalhe técnico.
 */
export function avisarErro(toast, err, fallback = PADRAO) {
  if (ehErroDePlano(err)) {
    useUpgradeModalStore.getState().openFromError(err, fallback);
    return;
  }

  toast(mensagemDoErro(err, fallback), 'error', err);
}

/** Dispara explicitamente o modal de sugestão de upgrade a partir de um erro de plano. */
export function dispararUpgrade(err, fallback = PADRAO) {
  useUpgradeModalStore.getState().openFromError(err, fallback);
}

/**
 * Conta de gestor tentando pedir acesso a um prédio.
 *
 * O servidor recusa com 403 e uma frase curta ("Conta de gestor não solicita
 * acesso a prédio"), e ela está certa, mas não ajuda: quem a lê quase sempre
 * criou a conta de gestor por engano, ou recebeu o QR Code de um prédio que
 * outra pessoa administra, e fica sem saber o que fazer em seguida. Esta é a
 * exceção à regra do topo do arquivo, a de que a frase do servidor vale: aqui a
 * tela sabe o próximo passo e o servidor não tem como dizê-lo.
 *
 * O reconhecimento é pelo código próprio, `GESTOR_NAO_SOLICITA_ACESSO`. Antes
 * era pela frase, porque o servidor devolvia o `FORBIDDEN` genérico, que o
 * mesmo pedido devolve por outros motivos. A frase ficou como reserva para um
 * servidor ainda na versão antiga durante a troca: se ele responder com o
 * genérico, a tela continua sabendo o próximo passo. As telas perguntam a esta
 * função, e não ao código nem à frase.
 */
export const CODIGO_GESTOR_PEDINDO_ACESSO = 'GESTOR_NAO_SOLICITA_ACESSO';
const FRASE_GESTOR_PEDINDO_ACESSO = /conta de gestor n[aã]o solicita acesso/i;

export function ehGestorPedindoAcesso(err) {
  const status = err?.response?.status;
  if (status !== 403) return false;
  const erro = err?.response?.data?.error ?? {};
  if (erro.code === CODIGO_GESTOR_PEDINDO_ACESSO) return true;
  return FRASE_GESTOR_PEDINDO_ACESSO.test(erro.message ?? '');
}

export const GESTOR_NAO_PEDE_ACESSO = {
  titulo: 'Conta de gestor não pede acesso',
  texto:
    'Gestores entram em um prédio sendo adicionados por outro gestor, e não por código, link ou QR Code. ' +
    'Peça ao gestor deste prédio para adicionar você.',
};

/**
 * A frase de um pedido de acesso que não passou.
 *
 * Igual a `mensagemDoErro`, com a explicação acima no lugar da frase seca
 * quando quem pediu é uma conta de gestor.
 */
export function mensagemDoPedidoDeAcesso(err, fallback = PADRAO) {
  if (ehGestorPedindoAcesso(err)) return `${GESTOR_NAO_PEDE_ACESSO.titulo}. ${GESTOR_NAO_PEDE_ACESSO.texto}`;
  return mensagemDoErro(err, fallback);
}
