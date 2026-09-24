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
  return err?.response?.data?.error?.message ?? fallback;
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
