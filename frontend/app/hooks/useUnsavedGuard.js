'use client';
import { createContext, useCallback, useContext, useEffect, useId, useState } from 'react';
import { useUnsavedStore } from '@/app/store/unsaved';

/**
 * Diz ao resto do sistema que este formulário tem alteração não salva.
 *
 * É o que faz a barra de baixo, o menu lateral e o recarregar da página
 * perguntarem antes de levar a pessoa embora — ver `UnsavedGuard`. O id vem do
 * `useId` porque a mesma caixa pode existir duas vezes na tela (a mesa de
 * chamados tem uma por coluna) e cada uma precisa sair do registro sozinha.
 */
export function useUnsavedFlag(dirty) {
  const id = useId();
  const mark = useUnsavedStore((s) => s.mark);

  useEffect(() => {
    mark(id, dirty);
    // Ao desmontar o formulário some do registro: um cartão que saiu da tela
    // não tem mais o que perder.
    return () => mark(id, false);
  }, [id, dirty, mark]);
}

/**
 * A saída de um formulário modificado passa por aqui.
 *
 * `guard(acao)` executa na hora quando não há nada a perder, e segura a ação
 * para depois quando há. Quem chama continua mandando na saída: a caixa de
 * confirmação só devolve o `sim` ou o `não`.
 *
 *     const saida = useUnsavedGuard(dirty);
 *     <Modal open={open} onClose={() => saida.guard(onClose)} ... />
 *     <UnsavedChangesModal open={saida.asking} onConfirm={saida.confirm} onCancel={saida.cancel} />
 *
 * A caixa da pergunta abre *por cima* da que está sendo fechada, e não no lugar
 * dela: o `<dialog>` empilha, e fechar a de baixo desmontaria o formulário —
 * "continuar editando" devolveria a pessoa a campos vazios.
 *
 * O aviso global vem junto (ver `useUnsavedFlag`): fechar a caixa e sair da
 * tela são a mesma perda, e nenhum formulário deveria ter de lembrar dos dois.
 */
export function useUnsavedGuard(dirty) {
  const [pending, setPending] = useState(null);
  useUnsavedFlag(dirty);

  const guard = useCallback(
    (action) => {
      if (!dirty) {
        action?.();
        return;
      }
      // A função vai dentro de um atualizador, senão o React a executaria
      // achando que é ela quem calcula o próximo estado.
      setPending(() => action ?? (() => {}));
    },
    [dirty]
  );

  function confirm() {
    const action = pending;
    setPending(null);
    action?.();
  }

  return {
    guard,
    asking: pending !== null,
    confirm,
    cancel: () => setPending(null),
  };
}

/**
 * O caminho de volta de um campo até a caixa que o contém.
 *
 * A caixa é quem fecha, mas quase nunca é ela quem sabe se houve mudança: o
 * texto da nota mora no bloco de notas, o valor no bloco de manutenção, a foto
 * no recorte. Sem isto, cada uma teria de subir o seu estado até o topo só para
 * a saída poder perguntar.
 */
const UnsavedScopeContext = createContext(null);

/**
 * Abre um escopo: devolve se algum campo lá dentro foi mexido, e o que embrulha
 * os filhos.
 */
export function useUnsavedScope() {
  const [dirtyIds, setDirtyIds] = useState([]);

  // Estável de propósito: é ele que atravessa o contexto, e um valor novo a
  // cada render faria todo campo se registrar de novo em toda digitação.
  const report = useCallback((id, isDirty) => {
    setDirtyIds((prev) => {
      const has = prev.includes(id);
      if (has === !!isDirty) return prev;
      return isDirty ? [...prev, id] : prev.filter((x) => x !== id);
    });
  }, []);

  return { dirty: dirtyIds.length > 0, report };
}

/** O embrulho dos filhos de um escopo. */
export function UnsavedScope({ report, children }) {
  return <UnsavedScopeContext.Provider value={report}>{children}</UnsavedScopeContext.Provider>;
}

/** Um campo avisando o escopo acima dele. Fora de um escopo, não faz nada. */
export function useUnsavedField(dirty) {
  const report = useContext(UnsavedScopeContext);
  const id = useId();

  useEffect(() => {
    if (!report) return undefined;
    report(id, dirty);
    return () => report(id, false);
  }, [report, id, dirty]);
}
