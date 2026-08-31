'use client';
import { useSyncExternalStore } from 'react';

/**
 * O endereço que está esperando um código, passado de uma tela para a outra.
 *
 * Ele viajava na query string — `/confirmar?email=...` e `/senha/nova?email=...`
 * —, e isso põe dado pessoal na URL: o endereço fica no histórico do navegador
 * e sai no cabeçalho `Referer` de qualquer recurso de terceiro que a página
 * venha a carregar. Hoje não há nenhum, mas basta alguém acrescentar um script
 * de análise para o vazamento começar sem aviso.
 *
 * `sessionStorage` e não `localStorage`: isto morre quando a aba fecha, que é
 * exatamente a vida útil de um código de dez minutos. Guardar no `localStorage`
 * deixaria o endereço no aparelho até alguém limpar.
 *
 * O preço é a aba: abrir `/confirmar` numa aba nova chega sem o endereço. As
 * duas telas tratam esse caso — a de confirmação pede o e-mail num campo, e a
 * de nova senha manda de volta pedir outro código.
 */
const CHAVE = 'viston:email-pendente';

export function guardarEmailPendente(email) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CHAVE, email);
  } catch {
    // Navegação privada em alguns navegadores recusa a escrita. Perder o
    // atalho é aceitável; as telas pedem o endereço.
  }
}

export function lerEmailPendente() {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(CHAVE) ?? '';
  } catch {
    return '';
  }
}

export function limparEmailPendente() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    // Idem.
  }
}

/**
 * O endereço guardado, lido do jeito que o React manda ler coisa de fora dele.
 *
 * `useSyncExternalStore` e não `useState` mais `useEffect`: o segundo é o
 * padrão que esta API veio substituir, e a regra `react-hooks/set-state-in-effect`
 * do projeto o recusa. O terceiro argumento é o que o servidor devolve — ele
 * não tem `sessionStorage`, e sem essa resposta separada o HTML do servidor
 * discordaria do cliente na hidratação.
 *
 * A assinatura não escuta nada: o valor é escrito na tela anterior, antes desta
 * montar, e não muda enquanto ela está aberta.
 */
const semAssinatura = () => () => {};

export function useEmailPendente() {
  return useSyncExternalStore(semAssinatura, lerEmailPendente, () => '');
}
