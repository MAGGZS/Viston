'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { Avatar } from '@/app/components/Avatar';
import { useAuthStore } from '@/app/store/auth';
import { T, R, W } from '@/app/lib/theme';

/**
 * O menu da conta, para as telas de desktop que não têm barra lateral.
 *
 * Onde existe barra, o rodapé dela já carrega "Perfil" e "Sair" — são duas
 * linhas sempre visíveis, e um menu ali seria esconder o que já estava à mão.
 * Onde não existe, a foto no canto era um link solto para o perfil: sair exigia
 * abrir outra tela para achar o botão.
 *
 * Dois itens, e não mais: perfil e sair. Menu de conta cresce sozinho se
 * deixarem — cada tela nova quer pendurar a sua opção ali — e o que o mantém
 * útil é ele responder só "quem sou eu" e "como saio daqui".
 */
export function MenuDaConta({ user }) {
  const router = useRouter();
  const { logout } = useAuthStore();
  const [aberto, setAberto] = useState(false);
  const casaRef = useRef(null);
  const gatilhoRef = useRef(null);
  const menuId = useId();

  /**
   * Fecha ao clicar fora e no Escape.
   *
   * `pointerdown`, e não `click`: o clique só chega depois de soltar o botão, e
   * até lá o menu continuava aberto por cima do que a pessoa foi clicar — o
   * primeiro toque fechava, e o segundo é que acertava o alvo.
   *
   * O foco volta ao gatilho no Escape. Sem isso ele cai no `<body>`, e a
   * próxima tecla começa a navegação da página do zero.
   */
  useEffect(() => {
    if (!aberto) return undefined;

    function foraDaCasa(e) {
      if (!casaRef.current?.contains(e.target)) setAberto(false);
    }

    function noEscape(e) {
      if (e.key !== 'Escape') return;
      setAberto(false);
      gatilhoRef.current?.focus();
    }

    document.addEventListener('pointerdown', foraDaCasa);
    document.addEventListener('keydown', noEscape);

    return () => {
      document.removeEventListener('pointerdown', foraDaCasa);
      document.removeEventListener('keydown', noEscape);
    };
  }, [aberto]);

  async function sair() {
    setAberto(false);
    await logout();
    router.replace('/login');
  }

  function ir(destino) {
    setAberto(false);
    router.push(destino);
  }

  return (
    <div ref={casaRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        ref={gatilhoRef}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? menuId : undefined}
        aria-label="Menu da conta"
        className="btn"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: aberto ? T.chip : 'transparent',
          border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px',
          borderRadius: R.pill, color: T.mute,
          '--btn-hover': T.chip,
        }}
      >
        <Avatar user={user} size={30} />
        <ChevronDown
          size={15}
          aria-hidden="true"
          style={{
            // O ícone gira em vez de trocar de desenho: a seta que sobe é a
            // mesma que desceu, e o giro liga o estado fechado ao aberto.
            transform: aberto ? 'rotate(180deg)' : 'none',
            transition: 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1)',
          }}
        />
      </button>

      {aberto && (
        <div
          id={menuId}
          role="menu"
          aria-label="Conta"
          // A mesma pele da lista do `Select`: é o painel suspenso do produto, e
          // um segundo desenho para a mesma coisa seria mais uma peça a manter
          // em dia com o tema.
          className="select-list anim-scale-in"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            minWidth: 220,
            // O menu cresce do canto onde a foto está, e não do meio de si
            // mesmo: é de lá que ele veio, e a origem certa é o que faz a
            // abertura parecer o gatilho se desdobrando.
            transformOrigin: 'top right',
          }}
        >
          {/* Quem está logado, antes das ações. Numa tela sem barra lateral, o
              nome da conta não aparece em lugar nenhum — e trocar de conta sem
              perceber é o tipo de engano que só se descobre depois. */}
          <div style={{ padding: '8px 10px 10px', borderBottom: `1px solid ${T.line}`, marginBottom: 6 }}>
            <p style={{ color: T.text, fontSize: 13, fontWeight: W.title, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name}
            </p>
            <p style={{ color: T.faint, fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </p>
          </div>

          {/* O tema saiu daqui: ele mora na aba de Aparência das configurações
              da conta, e a caixa que o menu abria deixou de existir. Item de
              menu que abre outra coisa por cima é o desvio que este menu
              existe para evitar. */}
          <ItemDoMenu icon={UserRound} label="Perfil" onClick={() => ir('/perfil')} />

          <div style={{ height: 1, background: T.line, margin: '6px 0' }} />

          <ItemDoMenu icon={LogOut} label="Sair" tone="danger" onClick={sair} />
        </div>
      )}

    </div>
  );
}

/** Uma linha do menu. */
function ItemDoMenu({ icon: Icon, label, tone = 'neutral', onClick }) {
  const cor = tone === 'danger' ? T.danger : T.text;

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="btn"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '9px 10px', borderRadius: R.control,
        color: cor, fontFamily: T.display, fontSize: 13, fontWeight: W.strong,
        textAlign: 'left',
        '--btn-hover': tone === 'danger' ? T.dangerSoft : T.chip,
      }}
    >
      <Icon size={15} style={{ flexShrink: 0 }} />
      {label}
    </button>
  );
}
