'use client';
import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Info, RefreshCw } from 'lucide-react';
import { CabecalhoAjuda, EstadoDaAjuda } from '@/app/components/ajuda/AjudaShell';
import { ListaDeTutoriais } from '@/app/components/ajuda/CartaoDoTutorial';
import { IconeDaPasta } from '@/app/components/ajuda/IconeDaPasta';
import { Badge, Button, Skeleton } from '@/app/components/ui';
import { useHelpFolder } from '@/app/hooks/useAjuda';
import { mensagemDoErro } from '@/app/lib/erros';
import { T, R, W } from '@/app/lib/theme';

/**
 * Tela 2 da central: os tutoriais de uma pasta, em cartões (ver
 * CartaoDoTutorial). No computador, a pasta fica aberta e marcada na árvore ao
 * lado, e os cartões ocupam a coluna da direita.
 *
 * `?aviso=indisponivel` chega quando o "?" de uma tela apontou para um tutorial
 * que ainda não foi publicado (ver a página do tutorial): em vez de uma tela de
 * erro, a pessoa cai na pasta certa, com uma linha dizendo o que aconteceu.
 *
 * Se a pasta inteira ainda não tem nada publicado, a API responde 404 (a pasta
 * vazia some da central). Com o aviso na URL, a pessoa segue então para a
 * central, com o mesmo aviso: "esta pasta não existe" seria falso, porque foi o
 * próprio produto que a mandou para cá.
 */
export default function PastaPage() {
  return (
    <Suspense fallback={null}>
      <ConteudoDaPasta />
    </Suspense>
  );
}

function ConteudoDaPasta() {
  const { pasta: slug } = useParams();
  const searchParams = useSearchParams();
  const aviso = searchParams?.get('aviso') === 'indisponivel';
  const { data, isLoading, isError, error, refetch, isFetching } = useHelpFolder(slug);
  const router = useRouter();
  const voltar = { href: '/ajuda', label: 'a central de ajuda' };
  const vazia = (isError && error?.response?.status === 404) || (data && (data.features ?? []).length === 0);
  const seguirParaACentral = aviso && vazia;

  useEffect(() => {
    if (seguirParaACentral) router.replace('/ajuda?aviso=indisponivel');
  }, [seguirParaACentral, router]);

  if (seguirParaACentral) return null;

  if (isLoading) {
    return (
      <>
        <CabecalhoAjuda voltar={voltar} titulo="Carregando a pasta..." />
        <div aria-busy="true" aria-label="Carregando os tutoriais" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 96, borderRadius: R.card }} />)}
        </div>
      </>
    );
  }

  if (isError) {
    const naoExiste = error?.response?.status === 404;
    return (
      <>
        <CabecalhoAjuda voltar={voltar} titulo={naoExiste ? 'Pasta não encontrada' : 'Ajuda e tutoriais'} />
        <EstadoDaAjuda
          titulo={naoExiste ? 'Esta pasta não existe' : 'Não deu para abrir esta pasta'}
          texto={naoExiste ? 'O endereço pode ter mudado. As pastas estão na central de ajuda.' : mensagemDoErro(error, 'Confira a conexão e tente de novo.')}
          acao={
            naoExiste ? (
              <Link href="/ajuda" className="btn btn--secondary" style={{ padding: '12px 20px', borderRadius: R.control, fontSize: 14, fontWeight: W.strong, textDecoration: 'none' }}>
                Ver as pastas
              </Link>
            ) : (
              <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
                <RefreshCw size={15} aria-hidden="true" /> Tentar de novo
              </Button>
            )
          }
        />
      </>
    );
  }

  const { folder, features = [] } = data;

  return (
    <>
      <CabecalhoAjuda
        voltar={voltar}
        eyebrow="Ajuda e tutoriais"
        titulo={folder.title}
        descricao={folder.description}
        icone={
          <span className="ajuda-icone ajuda-icone--grande">
            <IconeDaPasta nome={folder.icon} size={24} />
          </span>
        }
        extra={folder.mine ? <div style={{ marginTop: 10 }}><Badge variant="accent">Seu cargo</Badge></div> : null}
      />

      {aviso && (
        <p role="status" className="anim-fade-up" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: T.accentSoft, border: `1px solid ${T.accentLine}`, borderRadius: R.card, padding: '12px 14px', color: T.text, fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>
          <Info size={17} color={T.accentInk} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          O tutorial desta tela ainda está sendo preparado. Enquanto isso, veja os outros desta pasta.
        </p>
      )}

      {features.length === 0 ? (
        <EstadoDaAjuda
          titulo="Nenhum tutorial publicado aqui ainda"
          texto="Os tutoriais desta pasta estão em preparação. As outras pastas podem ter o que você procura."
          acao={
            <Link href="/ajuda" className="btn btn--secondary" style={{ padding: '12px 20px', borderRadius: R.control, fontSize: 14, fontWeight: W.strong, textDecoration: 'none' }}>
              Ver as outras pastas
            </Link>
          }
        />
      ) : (
        <ListaDeTutoriais pasta={folder.slug} features={features} rotulo={`Tutoriais de ${folder.title}`} className="anim-fade-up anim-d1" />
      )}
    </>
  );
}
