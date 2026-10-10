'use client';
import { Suspense, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Monitor, RefreshCw, Smartphone } from 'lucide-react';
import { AjudaShell, CabecalhoAjuda, EstadoDaAjuda } from '@/app/components/ajuda/AjudaShell';
import { PlayerTutorial } from '@/app/components/ajuda/PlayerTutorial';
import { IssoAjudou } from '@/app/components/ajuda/IssoAjudou';
import { Button, Skeleton } from '@/app/components/ui';
import { useHelpFeature } from '@/app/hooks/useAjuda';
import { cartaoSemVideo, duracaoPorExtenso, formatarDuracao, indiceDoPasso, linkDaAba } from '@/app/lib/ajuda';
import { mensagemDoErro } from '@/app/lib/erros';
import { T, R } from '@/app/lib/theme';

/**
 * Tela 3 da central: um tutorial, com o vídeo (quando já há) e uma aba por
 * passo. Sem vídeo, é o mesmo tutorial em passo a passo de texto (ver
 * PlayerTutorial).
 *
 * `?passo=N` abre direto na aba N, e é o que a busca e os links colados usam.
 * Cada troca de aba reescreve a URL no lugar (`history.replaceState`, que o
 * Next acompanha), sem empilhar histórico: o "voltar" do navegador continua
 * levando para onde a pessoa estava antes do tutorial, e não passo a passo para
 * trás.
 *
 * Tutorial que não existe para esta conta (não publicado, removido, ou da
 * pasta do admin) responde 404. É o caso do "?" de uma tela cujo tutorial o
 * admin tirou do ar, e a pessoa vai para a pasta dele, com um aviso, em vez de
 * parar numa tela de erro. Falta de vídeo não é 404: o tutorial abre em texto.
 */
export default function TutorialPage() {
  return (
    <AjudaShell>
      <Suspense fallback={null}>
        <ConteudoDoTutorial />
      </Suspense>
    </AjudaShell>
  );
}

function ConteudoDoTutorial() {
  const { pasta, funcionalidade } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isFetching } = useHelpFeature(funcionalidade);
  const naoExiste = isError && error?.response?.status === 404;
  const queryClient = useQueryClient();

  // Redirecionar é efeito de navegação, e não estado: mora num efeito.
  useEffect(() => {
    if (naoExiste) router.replace(`/ajuda/${pasta}?aviso=indisponivel`);
  }, [naoExiste, pasta, router]);

  const voltarPasta = { href: `/ajuda/${pasta}`, label: data?.feature?.folder?.title ?? 'a pasta' };

  if (isLoading || naoExiste) {
    // O esqueleto só desenha o palco quando sabe que há vídeo, e no formato
    // dele, para a tela não pular quando ele chega. Quem veio pela pasta tem o
    // tutorial no cache dela: com duração, há vídeo (e o aparelho diz se é em
    // pé); sem duração, é passo a passo em texto, e um palco de esqueleto
    // anunciaria um vídeo que não vem. Quem veio pelo "?" ou por um link não
    // tem cache, e aí o esqueleto fica neutro: só abas e painel, que existem
    // nos dois modos.
    const doCache = queryClient
      .getQueryData(['help', 'folder', pasta])
      ?.features?.find((f) => f.slug === funcionalidade);
    const palco =
      doCache && !cartaoSemVideo(doCache)
        ? doCache.device === 'MOBILE'
          ? { aspectRatio: '9 / 16', maxHeight: 'min(72vh, 640px)', borderRadius: R.card }
          : { aspectRatio: '16 / 9', maxHeight: '70vh', borderRadius: R.card }
        : null;
    return (
      <>
        <CabecalhoAjuda voltar={voltarPasta} titulo={naoExiste ? 'Abrindo a pasta...' : 'Carregando o tutorial...'} />
        <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {palco && <Skeleton style={palco} />}
          <Skeleton style={{ height: 44 }} />
          <Skeleton style={{ height: 140, borderRadius: R.card }} />
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <CabecalhoAjuda voltar={voltarPasta} titulo="Tutorial" />
        <EstadoDaAjuda
          titulo="Não deu para abrir este tutorial"
          texto={mensagemDoErro(error, 'Confira a conexão e tente de novo.')}
          acao={
            <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
              <RefreshCw size={15} aria-hidden="true" /> Tentar de novo
            </Button>
          }
        />
      </>
    );
  }

  const feature = data.feature;
  const total = feature.steps?.length ?? 0;
  const passo = indiceDoPasso(searchParams?.get('passo'), total);
  const pastaSlug = feature.folder?.slug ?? pasta;

  const aoTrocarPasso = (indice) => {
    if (typeof window === 'undefined') return;
    window.history.replaceState(null, '', linkDaAba(pastaSlug, feature.slug, indice + 1));
  };

  const duracao = formatarDuracao(feature.duration_s);
  const celular = feature.device === 'MOBILE';
  const Aparelho = celular ? Smartphone : Monitor;

  return (
    <>
      <CabecalhoAjuda
        voltar={{ href: `/ajuda/${pastaSlug}`, label: feature.folder?.title ?? 'a pasta' }}
        eyebrow={feature.folder?.title}
        titulo={feature.title}
        descricao={feature.summary}
        extra={
          <p style={{ display: 'flex', alignItems: 'center', gap: 14, color: T.mute, fontSize: 13, marginTop: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Aparelho size={14} aria-hidden="true" />
              {/* Sem vídeo, não há gravação: o aparelho continua valendo, porque
                  diz onde ficam os botões que os passos citam. */}
              {feature.video_url
                ? celular ? 'Gravado no celular' : 'Gravado no computador'
                : celular ? 'No celular' : 'No computador'}
            </span>
            {duracao && (
              <span>
                <span aria-hidden="true">{duracao}</span>
                <span className="sr-only">{duracaoPorExtenso(feature.duration_s)}</span>
              </span>
            )}
          </p>
        }
      />

      <div className="ajuda-tutorial anim-fade-up anim-d1">
        <PlayerTutorial
          feature={feature}
          passo={passo}
          onPassoChange={aoTrocarPasso}
          onUrlsVencidas={() => refetch()}
        />
        <IssoAjudou feature={feature} />
      </div>
    </>
  );
}
