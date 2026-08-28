'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UnsavedChangesModal } from '@/app/components/ConfirmModal';
import { useUnsavedStore } from '@/app/store/unsaved';

/**
 * A guarda de saída da página, montada uma vez no layout.
 *
 * Um formulário sabe se foi mexido, mas não sabe quando alguém vai embora: quem
 * leva a pessoa daqui é a barra de baixo, o menu lateral, o "Pular para o
 * conteúdo" — ou o próprio navegador, num F5. Por isso a escuta é uma só, no
 * documento inteiro, em vez de um guarda dentro de cada link.
 *
 * O clique é pego na fase de captura, antes de o `Link` do Next tratar dele:
 * depois já seria tarde, a troca de tela teria começado. Só o clique comum é
 * segurado — com Ctrl, Cmd ou o botão do meio, o link abre noutra aba e nada se
 * perde aqui.
 *
 * O que fica de fora, e fica de propósito: o botão de voltar do navegador. O
 * histórico não avisa antes de andar, e as saídas que existem para segurá-lo
 * (empurrar um estado falso e desfazer) quebram o botão para quem não tem nada
 * pendente. Quem volta pelo gesto do telefone perde o preenchimento — é o mesmo
 * limite de qualquer site.
 */
export function UnsavedGuard() {
  const router = useRouter();
  const hasUnsaved = useUnsavedStore((s) => s.dirty.length > 0);
  const pending = useUnsavedStore((s) => s.pending);
  const request = useUnsavedStore((s) => s.request);
  const confirm = useUnsavedStore((s) => s.confirm);
  const cancel = useUnsavedStore((s) => s.cancel);

  /** Recarregar e fechar a aba: a pergunta é do navegador, e o texto é dele. */
  useEffect(() => {
    if (!hasUnsaved) return undefined;

    function onBeforeUnload(event) {
      event.preventDefault();
      // Navegadores antigos só respeitam a saída pelo `returnValue`.
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved]);

  useEffect(() => {
    if (!hasUnsaved) return undefined;

    function onClick(event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor || anchor.hasAttribute('download')) return;
      if (anchor.target && anchor.target !== '_self') return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Âncora na própria tela (o "Pular para o conteúdo", por exemplo): não
      // leva ninguém a lugar nenhum, e perguntar ali seria só barulho.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      event.preventDefault();
      event.stopPropagation();
      request(() => router.push(`${url.pathname}${url.search}${url.hash}`));
    }

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [hasUnsaved, request, router]);

  return (
    <UnsavedChangesModal
      open={!!pending}
      confirmLabel="Sair sem salvar"
      onConfirm={confirm}
      onCancel={cancel}
    />
  );
}
