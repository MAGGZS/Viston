'use client';

/**
 * O rascunho da vistoria, guardado no aparelho.
 *
 * Este é o maior risco de produto do app: a vistoria vive inteira na memória
 * até o envio final. Trocar de aba no iOS, atender uma ligação, a bateria
 * acabar — em qualquer um deles o navegador descarta a página e o inspetor
 * perde quarenta minutos de trabalho no 18º andar, sem ter feito nada errado.
 *
 * `localStorage` e não IndexedDB: o que se guarda são algumas dezenas de
 * ocorrências em texto, cabe folgado, e a escrita síncrona é o que permite
 * salvar no meio do `visibilitychange` — quando o sistema está prestes a
 * matar a aba, não sobra tempo para um `await`.
 *
 * Um rascunho por prédio. Duas vistorias do mesmo prédio ao mesmo tempo, no
 * mesmo aparelho, não é caso real; prédios diferentes é.
 */
const PREFIX = 'viston:vistoria:';

/**
 * Idade máxima do rascunho.
 *
 * Uma vistoria dura uma manhã. Rascunho de dois dias atrás é lixo — e oferecer
 * a retomada dele é pior do que não oferecer nada: a pessoa aceita, não
 * reconhece o que está lá e desconfia do que mais o app guardou.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function key(buildingId) {
  return `${PREFIX}${buildingId}`;
}

/**
 * Guarda o andamento da vistoria.
 *
 * Nunca lança: ficar sem espaço (modo privado do Safari, cota estourada) não
 * pode derrubar a vistoria que está sendo preenchida — o rascunho é rede de
 * segurança, não parte do fluxo.
 */
export function saveDraft(buildingId, draft) {
  if (typeof window === 'undefined' || !buildingId) return;
  try {
    localStorage.setItem(key(buildingId), JSON.stringify({ ...draft, saved_at: Date.now() }));
  } catch {
    // Sem espaço para o rascunho: a vistoria segue em memória, como antes.
  }
}

/** O rascunho guardado, se houver um recente. */
export function loadDraft(buildingId) {
  if (typeof window === 'undefined' || !buildingId) return null;
  try {
    const raw = localStorage.getItem(key(buildingId));
    if (!raw) return null;

    const draft = JSON.parse(raw);
    if (!draft?.saved_at || Date.now() - draft.saved_at > MAX_AGE_MS) {
      clearDraft(buildingId);
      return null;
    }
    if (!Array.isArray(draft.floors) || draft.floors.length === 0) return null;

    return draft;
  } catch {
    // Rascunho ilegível (formato antigo, escrita interrompida) não serve para
    // nada e não pode travar a tela: some.
    clearDraft(buildingId);
    return null;
  }
}

export function clearDraft(buildingId) {
  if (typeof window === 'undefined' || !buildingId) return;
  try {
    localStorage.removeItem(key(buildingId));
  } catch {
    // Nada a fazer, e nada que dependa disso.
  }
}
