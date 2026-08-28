'use client';
import { create } from 'zustand';

/**
 * Os formulários que estão na tela com alteração não salva.
 *
 * O registro é global porque quem tira a pessoa de um formulário quase nunca é
 * o formulário: é a barra de baixo, o menu lateral, o botão de voltar, o F5. O
 * formulário sabe que foi mexido; só quem escuta a saída pode perguntar antes
 * de ela acontecer.
 *
 * É uma lista de ids, e não um booleano: duas caixas podem estar preenchidas ao
 * mesmo tempo (a nota do chamado e o relatório da conclusão, por exemplo), e um
 * contador único faria a primeira a fechar dizer que já não há nada pendente.
 */
export const useUnsavedStore = create((set, get) => ({
  /** Ids dos formulários modificados que continuam montados. */
  dirty: [],

  /**
   * A saída que espera confirmação.
   *
   * Guardar a ação, e não só a intenção, é o que permite a caixa perguntar sem
   * saber para onde a pessoa ia: confirmar apenas executa o que estava pronto
   * para acontecer.
   */
  pending: null,

  mark: (id, isDirty) =>
    set((s) => {
      const has = s.dirty.includes(id);
      if (has === !!isDirty) return s;
      return { dirty: isDirty ? [...s.dirty, id] : s.dirty.filter((x) => x !== id) };
    }),

  hasUnsaved: () => get().dirty.length > 0,

  /** Faz agora, se não há nada a perder; senão, pergunta primeiro. */
  request: (proceed) => {
    if (!get().hasUnsaved()) {
      proceed();
      return;
    }
    // `set` com função seria tratado como atualizador pelo zustand — daí o
    // objeto literal com a ação dentro.
    set({ pending: proceed });
  },

  confirm: () => {
    const { pending } = get();
    set({ pending: null });
    pending?.();
  },

  cancel: () => set({ pending: null }),
}));
