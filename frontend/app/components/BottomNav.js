'use client';
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ClipboardList, User, Wrench } from 'lucide-react';
import { M } from '@/app/components/mobile/kit';
import { useAuthStore } from '@/app/store/auth';
import { isResponsible } from '@/app/lib/roles';

/**
 * As entradas na ordem em que aparecem — e a ordem importa fora daqui.
 *
 * É ela que decide de que lado a tela nova desliza (ver `ORDEM_TELAS`, em
 * lib/telaMovel.js). As duas listas têm de continuar iguais, e há um teste que
 * as compara: se divergirem, nada quebra — a tela só passa a entrar pelo lado
 * errado, e é o tipo de defeito que ninguém liga à lista.
 */
const items = [
  { href: '/home', icon: Home, label: 'Início' },
  { href: '/historico', icon: ClipboardList, label: 'Histórico' },
  { href: '/perfil', icon: User, label: 'Perfil' },
];

/**
 * A barra de baixo.
 *
 * O responsável ganha uma entrada a mais: os chamados dele. Ela só aparece para
 * quem atende chamado em algum prédio — para o resto seria uma tela vazia.
 *
 * Ela é desenhada no `<body>`, e não onde a tela a escreve.
 *
 * É `position: fixed`, e elemento com `transform` vira bloco de contenção para
 * filho fixo. Como a tela agora desliza ao entrar (ver `MPage`), a barra
 * viajaria junto: a chrome que devia ficar parada escorregaria com o conteúdo,
 * meio segundo por troca de tela. O portal a tira do caminho de uma vez, em vez
 * de cada tela ter de lembrar de a pôr fora do que anima.
 *
 * De quebra, o marco de navegação sai de dentro do `<main>`, que é onde ele
 * nunca devia ter estado: quem usa leitor de tela pede "conteúdo principal" e
 * recebia a barra junto.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  // No servidor não há `document` para receber o portal. `useSyncExternalStore`
  // e não um estado com efeito: o projeto proíbe `setState` dentro de efeito
  // (ver a regra react-hooks/set-state-in-effect), e aqui não há nada a que se
  // inscrever — só a diferença entre desenhar no servidor e no navegador.
  const noNavegador = useSyncExternalStore(() => () => {}, () => true, () => false);

  const navItems = isResponsible(user)
    ? [items[0], { href: '/responsavel', icon: Wrench, label: 'Chamados' }, ...items.slice(1)]
    : items;

  if (!noNavegador) return null;

  return createPortal(
    <nav aria-label="Navegação principal" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
      background: M.bg, borderTop: `1px solid ${M.line}`,
      padding: '10px 8px calc(14px + env(safe-area-inset-bottom))',
      display: 'flex',
    }}>
      {navItems.map(({ href, icon: Icon, label }) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            padding: '6px 0', textDecoration: 'none',
            color: active ? M.accent : M.faint, transition: 'color 0.2s',
          }}>
            <Icon size={21} strokeWidth={active ? 2.4 : 1.8} />
            <span style={{ fontFamily: M.display, fontSize: 12, fontWeight: active ? 600 : 500 }}>{label}</span>
          </Link>
        );
      })}
    </nav>,
    document.body
  );
}
