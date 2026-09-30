'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Monitor, Smartphone } from 'lucide-react';
import { useAuthStore } from '@/app/store/auth';
import { DESKTOP_QUERY } from '@/app/hooks/useMediaQuery';
import { canInspect, isAdmin, isManagerAccount, isResponsible, memberships } from '@/app/lib/roles';
import { T, R, W } from '@/app/lib/theme';

/**
 * Para onde cada conta vai quando abre no computador uma tela que é de celular.
 *
 * A mesma escolha da raiz (ver `app/page.js`), agora num lugar só: a raiz decide
 * uma vez, na chegada, e quem entrava por link salvo, pelo "voltar" ou por um
 * redirecionamento de outra tela caía na versão de telefone esticada na largura
 * inteira do monitor.
 */
export function destinoNoComputador(user) {
  if (isManagerAccount(user)) return '/gestor';
  if (isAdmin(user)) return '/desktop/admin/dashboard';
  if (memberships(user).some((m) => m.role === 'MODERADOR')) return '/moderador';
  if (isResponsible(user) && !canInspect(user)) return '/responsavel/painel';
  return '/desktop/visualizacao';
}

/** O ponto de corte lido na hora — não pelo hook, que nasce `false` na hidratação. */
function larguraDeComputador() {
  return typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * O aviso que ocupa o lugar da tela da largura errada.
 *
 * Aparece só no instante entre a carga e o redirecionamento, ou quando a janela
 * muda de largura com a tela aberta. Nesse segundo caso não há redirecionamento:
 * a tela pode ter um formulário pela metade (a vistoria, por exemplo), e ele
 * continua montado por baixo — voltar a janela à largura de antes devolve tudo
 * como estava.
 */
function AvisoDeLargura({ className, icon: Icon, titulo, texto, href, acao }) {
  return (
    <div
      className={`${className} flex-col items-center justify-center min-h-screen text-center`}
      style={{ background: T.bg, padding: 32 }}
    >
      <Icon className="anim-pop-in" size={40} color={T.faint} style={{ marginBottom: 16 }} aria-hidden="true" />
      <p className="anim-fade-up anim-d1" style={{ color: T.text, fontWeight: W.title, fontSize: 18 }}>{titulo}</p>
      <p className="anim-fade-up anim-d2" style={{ color: T.mute, fontSize: 14, marginTop: 8, lineHeight: 1.6, maxWidth: 380 }}>
        {texto}
      </p>
      <Link
        href={href}
        className="anim-fade-up anim-d3"
        style={{
          marginTop: 20, padding: '10px 18px', borderRadius: R.control,
          background: T.accent, color: T.onAccent, fontSize: 14, fontWeight: W.title,
          textDecoration: 'none',
        }}
      >
        {acao}
      </Link>
    </div>
  );
}

/**
 * Tela que só existe no celular.
 *
 * Como o `RouteGuard` do visualizador, quem esconde é o CSS: o par
 * `lg:hidden` / `hidden lg:flex` troca no mesmo quadro do redimensionamento, sem
 * esperar evento nenhum do JavaScript. O JavaScript só decide o redirecionamento,
 * e só na chegada — ver `AvisoDeLargura` para o porquê de não seguir o resize.
 *
 * `destino` sobrepõe a escolha por conta, para a tela que tem par exato no
 * computador (o chamado do responsável abre no quadro, com a caixa dele aberta).
 */
export function SoNoCelular({ children, destino }) {
  const { user } = useAuthStore();
  const router = useRouter();
  const alvo = destino ?? destinoNoComputador(user);

  useEffect(() => {
    if (user && larguraDeComputador()) router.replace(alvo);
    // Só na chegada: seguir o resize descartaria o que estiver pela metade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="lg:hidden">{children}</div>
      <AvisoDeLargura
        className="hidden lg:flex"
        icon={Smartphone}
        titulo="Esta tela é do celular"
        texto="No computador, o mesmo trabalho tem uma tela própria, com mais espaço."
        href={alvo}
        acao="Abrir a versão do computador"
      />
    </>
  );
}

/**
 * O par do de cima: tela que só existe no computador, com volta para o celular.
 *
 * Diferente do aviso "acesse pelo computador" das mesas do gestor e do moderador:
 * aqui existe uma versão de telefone do mesmo trabalho, então o celular não é
 * barrado — é levado a ela.
 */
export function SoNoComputador({ children, destinoNoCelular }) {
  const router = useRouter();

  useEffect(() => {
    if (!larguraDeComputador()) router.replace(destinoNoCelular);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {children}
      <AvisoDeLargura
        className="flex lg:hidden"
        icon={Monitor}
        titulo="Esta tela é do computador"
        texto="No celular, os seus chamados ficam numa tela feita para ele."
        href={destinoNoCelular}
        acao="Abrir no celular"
      />
    </>
  );
}
