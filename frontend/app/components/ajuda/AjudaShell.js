'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { MPage } from '@/app/components/mobile/kit';
import { BottomNav } from '@/app/components/BottomNav';
import { Avatar } from '@/app/components/Avatar';
import { Logo } from '@/app/components/Logo';
import { useAuthStore } from '@/app/store/auth';
import { isManager, isViewerOnly } from '@/app/lib/roles';
import { T, R, W } from '@/app/lib/theme';

/**
 * A casca das três telas da central de ajuda.
 *
 * Um conteúdo só para as duas larguras, e não a cópia de telefone e a de
 * computador lado a lado que outras telas usam. O motivo é o player: duas
 * cópias seriam dois `<video>` na mesma página, as duas baixando metadados, e
 * duas listas de abas com os mesmos ids. O que muda de uma largura para a outra
 * é só a moldura, e moldura o CSS resolve (ver `.ajuda-*` no globals.css).
 *
 * No telefone vale o `MPage`, como em toda tela de celular: o `<main>` com o
 * alvo do "Pular para o conteúdo" e o espaço da barra de baixo. No computador
 * entra por cima a faixa com a marca e o perfil, a mesma do perfil sem barra
 * lateral: a central não tem item em menu lateral nenhum (decisão do
 * proprietário), então é esta faixa que dá a saída de volta ao produto.
 *
 * `qualquerAparelho` na guarda: o visualizador, que fora daqui só entra pelo
 * computador, também lê a ajuda no telefone.
 */
export function AjudaShell({ children }) {
  const { user } = useAuthStore();

  return (
    <RouteGuard qualquerAparelho>
      <header className="ajuda-faixa hidden lg:flex">
        <Link href="/" aria-label="Viston, página inicial" className="link-acao" style={{ display: 'inline-flex', color: T.text }}>
          <Logo size={16} variant="horizontal" />
        </Link>
        <Link href="/perfil" className="link-acao" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: T.mute, fontSize: 14 }}>
          Perfil
          <Avatar user={user} size={30} />
        </Link>
      </header>

      <MPage>
        <div className="ajuda-miolo">{children}</div>
        {/* A mesma regra do perfil: o gestor não tem início nem histórico de
            celular, então a barra de baixo não é dele. O visualizador também
            não: as telas para onde ela leva não abrem no telefone dele. */}
        {!isManager(user) && !isViewerOnly(user) && <BottomNav />}
      </MPage>
    </RouteGuard>
  );
}

/**
 * O topo de cada tela da central: a volta, o rótulo de onde se está e o título.
 *
 * A volta é um link com destino fixo, e não o `router.back()`: quem chega pelo
 * "?" de uma tela ou por um link colado numa conversa não tem para onde
 * "voltar" dentro da central, e o histórico do navegador poderia tirá-lo do
 * produto. Subir um nível (tutorial, pasta, central) é sempre o mesmo gesto.
 *
 * A exceção é `voltar.aoClicar`, usado só no topo da central pelo visualizador
 * no telefone: para ele não existe destino fixo que abra (todas as outras telas
 * mostram o aviso de "só pelo computador"), e o gesto passa a ser o voltar do
 * navegador.
 */
export function CabecalhoAjuda({ voltar, eyebrow, titulo, descricao, extra, icone }) {
  return (
    <header className="ajuda-topo anim-fade-down">
      {voltar?.aoClicar ? (
        <button
          type="button"
          onClick={voltar.aoClicar}
          aria-label={`Voltar para ${voltar.label}`}
          className="icone-btn icone-btn--chip"
          style={{ marginBottom: 14 }}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
      ) : voltar ? (
        <Link
          href={voltar.href}
          aria-label={`Voltar para ${voltar.label}`}
          className="icone-btn icone-btn--chip"
          style={{ marginBottom: 14 }}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {icone}
        <div style={{ minWidth: 0, flex: 1 }}>
          {eyebrow && <p style={{ color: T.mute, fontSize: 13, marginBottom: 4 }}>{eyebrow}</p>}
          <h1 style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 24, color: T.text, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            {titulo}
          </h1>
          {descricao && (
            <p style={{ color: T.mute, fontSize: 15, lineHeight: 1.55, marginTop: 6, maxWidth: 640 }}>{descricao}</p>
          )}
          {extra}
        </div>
      </div>
    </header>
  );
}

/** Estado vazio ou de erro, no mesmo cartão em todas as telas da central. */
export function EstadoDaAjuda({ titulo, texto, acao }) {
  return (
    <div style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: '26px 20px', textAlign: 'center' }}>
      <p style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 16, color: T.text }}>{titulo}</p>
      {texto && <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.55, marginTop: 6, maxWidth: 440, marginInline: 'auto' }}>{texto}</p>}
      {acao && <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>{acao}</div>}
    </div>
  );
}
