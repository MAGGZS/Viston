'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Monitor, Pencil, Smartphone, TriangleAlert } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { PlayerTutorial } from '@/app/components/ajuda/PlayerTutorial';
import { EnvioDoPacote } from '@/app/components/ajuda/EnvioDoPacote';
import { EditorDeAbas } from '@/app/components/ajuda/EditorDeAbas';
import { EditarItemModal } from '@/app/components/ajuda/EditarItemModal';
import { SelosDoTutorial } from '@/app/components/ajuda/SelosDoTutorial';
import { Badge, Button, Skeleton } from '@/app/components/ui';
import { CONTENT_ID } from '@/app/components/mobile/kit';
import { useAdminHelpFeature, useHelpTree, usePublishHelpFeature } from '@/app/hooks/useAjuda';
import { AVISO_DESATUALIZADO, estadoDoVideo, formatarDuracao } from '@/app/lib/ajuda';
import { mensagemDoErro } from '@/app/lib/erros';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

/**
 * Tutoriais, tela 2 do admin: uma funcionalidade e o vídeo dela.
 *
 * O admin chega aqui pela árvore, e a tela mostra onde o vídeo vai entrar: a
 * pasta, a funcionalidade, as abas com os tempos. A pré-visualização é o player
 * da Tela 3 do usuário, o mesmo componente, para que conferir aqui seja
 * conferir lá.
 *
 * Publicar não depende de vídeo: o tutorial sem vídeo vai ao ar com os passos
 * em texto, e a pré-visualização mostra exatamente esse modo. O cabeçalho traz
 * os dois selos, publicação e vídeo, porque são perguntas diferentes.
 *
 * As três ações que mudam o que o público vê (publicar, despublicar, substituir
 * o vídeo) pedem confirmação. Publicar leva o "i" neutro: é o resultado
 * esperado do trabalho. Despublicar e substituir levam o triângulo: tiram ou
 * trocam o que já está no ar.
 */
export default function TutorialAdminPage() {
  const { id } = useParams();
  const { data, isLoading, isError, error, refetch } = useAdminHelpFeature(id);
  // A árvore serve à conferência do pacote: com ela, um pacote de outra
  // funcionalidade é recusado com o nome e o link da certa. Já está em cache
  // para quem veio da árvore.
  const { data: arvore } = useHelpTree();

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-page">
        <AdminSidebar />
        <main id={CONTENT_ID} className="flex-1 px-6 py-8 overflow-auto" style={{ minWidth: 0 }}>
          <Link href="/desktop/admin/tutoriais" className="link-acao anim-fade-down" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.mute, fontSize: 14, marginBottom: 14 }}>
            <ArrowLeft size={16} aria-hidden="true" /> Tutoriais
          </Link>

          {isLoading ? (
            <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Skeleton style={{ height: 30, width: 360 }} />
              <Skeleton style={{ height: 320, borderRadius: R.card }} />
            </div>
          ) : isError ? (
            <div style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: 20, maxWidth: 640 }}>
              <h1 style={{ color: T.text, fontWeight: W.title, fontSize: 18 }}>
                {error?.response?.status === 404 ? 'Funcionalidade não encontrada' : 'Não deu para abrir a funcionalidade'}
              </h1>
              <p style={{ color: T.mute, fontSize: 14, marginTop: 6 }}>{mensagemDoErro(error)}</p>
              {error?.response?.status !== 404 && (
                <Button variant="secondary" onClick={() => refetch()} style={{ marginTop: 14 }}>Tentar de novo</Button>
              )}
            </div>
          ) : (
            <Conteudo feature={data.feature} arvore={arvore} onUrlsVencidas={() => refetch()} />
          )}
        </main>
      </div>
    </RouteGuard>
  );
}

function Conteudo({ feature, arvore, onUrlsVencidas }) {
  const videoRef = useRef(null);
  const publicar = usePublishHelpFeature(feature.id);
  const { show: toast } = useToastStore();
  const [pergunta, setPergunta] = useState(null);
  const [erroDaPergunta, setErroDaPergunta] = useState(null);
  const [editando, setEditando] = useState(false);

  const desatualizado = estadoDoVideo(feature) === 'DESATUALIZADO';
  const celular = feature.device === 'MOBILE';
  const Aparelho = celular ? Smartphone : Monitor;
  const temVideo = Boolean(feature.video_url);
  const duracao = formatarDuracao(feature.duration_s);

  const confirmar = async () => {
    const vaiPublicar = pergunta === 'publicar';
    try {
      await publicar.mutateAsync(vaiPublicar);
      toast(vaiPublicar ? 'Tutorial publicado' : 'Tutorial despublicado');
      setPergunta(null);
    } catch (e) {
      // A caixa fica aberta com a recusa dentro, e o botão volta ao normal.
      setErroDaPergunta(mensagemDoErro(e, vaiPublicar ? 'Não foi possível publicar.' : 'Não foi possível despublicar.'));
    }
  };
  const perguntar = (qual) => {
    setErroDaPergunta(null);
    setPergunta(qual);
  };
  const fecharPergunta = () => {
    setErroDaPergunta(null);
    setPergunta(null);
  };

  return (
    <>
      <header className="anim-fade-down" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ color: T.mute, fontSize: 13 }}>{feature.folder?.title}</p>
          <h1 style={{ fontFamily: T.display, color: T.text, fontSize: 24, fontWeight: W.title, marginTop: 2 }}>{feature.title}</h1>
          {feature.summary && <p style={{ color: T.mute, fontSize: 14, marginTop: 4, maxWidth: 640 }}>{feature.summary}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <SelosDoTutorial feature={feature} />
            <Badge>
              <Aparelho size={13} aria-hidden="true" /> {celular ? 'Celular' : 'Computador'}
            </Badge>
            {!feature.in_catalog && <Badge variant="warning">Fora do roteiro</Badge>}
            {duracao && <span style={{ color: T.mute, fontSize: 13 }}>{duracao}</span>}
            {feature.video_uploaded_at && (
              <span style={{ color: T.mute, fontSize: 13 }}>
                Enviado em {new Date(feature.video_uploaded_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                {feature.video_uploaded_by?.name ? ` por ${feature.video_uploaded_by.name}` : ''}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Button variant="secondary" onClick={() => setEditando(true)}>
            <Pencil size={15} aria-hidden="true" /> Editar
          </Button>
          {feature.published ? (
            <Button variant="secondary" onClick={() => perguntar('despublicar')}>
              <EyeOff size={15} aria-hidden="true" /> Despublicar
            </Button>
          ) : (
            <Button onClick={() => perguntar('publicar')}>
              <Eye size={15} aria-hidden="true" /> Publicar
            </Button>
          )}
        </div>
      </header>

      {desatualizado && (
        <Aviso titulo="Vídeo desatualizado">
          {AVISO_DESATUALIZADO}{' '}
          {!feature.in_catalog
            ? 'Esta funcionalidade saiu do roteiro e continua aqui até alguém decidir o que fazer com ela.'
            : feature.published
              ? 'Até lá, o tutorial continua no ar com o vídeo atual.'
              : 'Se for publicado antes disso, vai ao ar com o vídeo atual.'}
        </Aviso>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" style={{ alignItems: 'start' }}>
        <section aria-labelledby="previa-titulo" className="anim-fade-up" style={{ minWidth: 0 }}>
          <h2 id="previa-titulo" style={{ color: T.text, fontSize: 15, fontWeight: W.title, marginBottom: 4 }}>Pré-visualização</h2>
          <p style={{ color: T.mute, fontSize: 13, marginBottom: 12 }}>
            {temVideo
              ? 'Exatamente o que a pessoa vê na central. Clique nas abas para conferir se cada uma cai no ponto certo.'
              : 'Exatamente o que a pessoa vê na central enquanto não há vídeo: o passo a passo em texto.'}
          </p>
          <PlayerTutorial feature={feature} videoRef={videoRef} onUrlsVencidas={onUrlsVencidas} tituloNivel="h3" />
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <section aria-labelledby="video-titulo" className="anim-fade-up anim-d1" style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: 18 }}>
            <h2 id="video-titulo" style={{ color: T.text, fontSize: 15, fontWeight: W.title, marginBottom: 10 }}>
              {temVideo ? 'Substituir o vídeo' : 'Enviar vídeo'}
            </h2>
            <EnvioDoPacote feature={feature} arvore={arvore} />
          </section>

          <section aria-labelledby="abas-titulo" className="anim-fade-up anim-d2" style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: 18 }}>
            <h2 id="abas-titulo" style={{ color: T.text, fontSize: 15, fontWeight: W.title, marginBottom: 4 }}>
              Abas ({feature.steps.length})
            </h2>
            <p style={{ color: T.mute, fontSize: 13, marginBottom: 12 }}>
              {temVideo
                ? 'Os tempos vieram do pacote. Para um ajuste fino, pause a pré-visualização no ponto certo e use o tempo atual.'
                : 'Os tempos chegam com o pacote do vídeo.'}
            </p>
            <EditorDeAbas feature={feature} videoRef={videoRef} />
          </section>
        </div>
      </div>

      <ConfirmModal
        open={pergunta === 'publicar'}
        title="Publicar este tutorial?"
        message={
          `"${feature.title}" passa a aparecer na central de ajuda, na pasta ${feature.folder?.title}, para todo mundo que enxerga essa pasta.` +
          (temVideo ? '' : ' Sem vídeo, aparece só com os passos em texto; o vídeo entra no topo quando for enviado.')
        }
        confirmLabel="Publicar"
        confirmVariant="primary"
        tone="neutral"
        loading={publicar.isPending}
        loadingLabel="Publicando..."
        loadingAnnouncement={`Publicando "${feature.title}"`}
        error={erroDaPergunta}
        onConfirm={confirmar}
        onCancel={fecharPergunta}
      />
      <ConfirmModal
        open={pergunta === 'despublicar'}
        title="Despublicar este tutorial?"
        message={`"${feature.title}" sai da central de ajuda, e o "?" das telas que apontam para ele passa a levar à pasta. ${temVideo ? 'O vídeo e os ajustes continuam aqui.' : 'Os ajustes continuam aqui.'}`}
        confirmLabel="Despublicar"
        confirmVariant="primary"
        tone="danger"
        loading={publicar.isPending}
        loadingLabel="Despublicando..."
        loadingAnnouncement={`Despublicando "${feature.title}"`}
        error={erroDaPergunta}
        onConfirm={confirmar}
        onCancel={fecharPergunta}
      />

      <EditarItemModal editando={editando ? { tipo: 'feature', item: feature } : null} onClose={() => setEditando(false)} />
    </>
  );
}

function Aviso({ titulo, children }) {
  return (
    <div role="note" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: T.dangerSoft, borderRadius: R.card, padding: '14px 16px', marginBottom: 18, maxWidth: 880 }}>
      <TriangleAlert size={18} color={T.danger} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <p style={{ color: T.danger, fontWeight: W.title, fontSize: 14 }}>{titulo}</p>
        <p style={{ color: T.text, fontSize: 14, lineHeight: 1.55, marginTop: 2 }}>{children}</p>
      </div>
    </div>
  );
}
