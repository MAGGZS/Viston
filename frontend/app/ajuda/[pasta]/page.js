'use client';
import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Info, ListOrdered, Monitor, PlayCircle, RefreshCw, Smartphone } from 'lucide-react';
import { AjudaShell, CabecalhoAjuda, EstadoDaAjuda } from '@/app/components/ajuda/AjudaShell';
import { IconeDaPasta } from '@/app/components/ajuda/IconeDaPasta';
import { Badge, Button, Skeleton } from '@/app/components/ui';
import { useHelpFolder } from '@/app/hooks/useAjuda';
import { SELO_TEXTO, cartaoSemVideo, duracaoPorExtenso, formatarDuracao } from '@/app/lib/ajuda';
import { mensagemDoErro } from '@/app/lib/erros';
import { T, R, W } from '@/app/lib/theme';

/**
 * Tela 2 da central: os tutoriais de uma pasta.
 *
 * Cada cartão diz o que a pessoa precisa para decidir se abre agora: o
 * título, o resumo, quanto tempo leva o vídeo (ou que é passo a passo em
 * texto, quando ainda não há vídeo) e se foi feito no celular ou no
 * computador. Este último não é enfeite: o inspetor que abre no computador um
 * tutorial gravado no celular precisa saber que os botões vão estar em outro
 * lugar na tela dele.
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
    <AjudaShell>
      <Suspense fallback={null}>
        <ConteudoDaPasta />
      </Suspense>
    </AjudaShell>
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
        <ul aria-label={`Tutoriais de ${folder.title}`} className="anim-fade-up anim-d1" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {features.map((f) => (
            <li key={f.id}>
              <CartaoDoTutorial pasta={folder.slug} feature={f} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Um tutorial da pasta.
 *
 * A capa entra quando existe, com proporção fixa, para o cartão não mudar de
 * altura quando a imagem chega. Sem capa, um ícone ocupa o mesmo lugar e o
 * alinhamento da lista não muda: o de reproduzir quando há vídeo, o de lista
 * numerada quando o tutorial é só texto, que aí também troca a duração pelo
 * selo "Passo a passo em texto". Um "0:00" ou um botão de play num tutorial
 * sem vídeo prometeria o que a tela seguinte não tem.
 */
function CartaoDoTutorial({ pasta, feature }) {
  const soTexto = cartaoSemVideo(feature);
  const duracao = soTexto ? null : formatarDuracao(feature.duration_s);
  const celular = feature.device === 'MOBILE';
  const Aparelho = celular ? Smartphone : Monitor;

  return (
    <Link href={`/ajuda/${pasta}/${feature.slug}`} className="ajuda-cartao" style={{ display: 'flex', gap: 14, padding: 12, alignItems: 'center' }}>
      <span className="ajuda-capa" aria-hidden="true">
        {feature.poster_url ? (
          // A capa é decorativa (o título ao lado já diz o que é), e `next/image`
          // não serve aqui: a URL é assinada e muda, e o otimizador do Next
          // guardaria cópias de cada assinatura.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={feature.poster_url} alt="" loading="lazy" />
        ) : soTexto ? (
          <ListOrdered size={24} color={T.mute} />
        ) : (
          <PlayCircle size={24} color={T.mute} />
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
        <span style={{ display: 'block', fontFamily: T.display, fontWeight: W.title, fontSize: 15, color: T.text, lineHeight: 1.35 }}>
          {feature.title}
        </span>
        {feature.summary && (
          <span style={{ display: 'block', color: T.mute, fontSize: 14, lineHeight: 1.5, marginTop: 3 }}>{feature.summary}</span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', color: T.mute, fontSize: 13, marginTop: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Aparelho size={14} aria-hidden="true" />
            {celular ? 'No celular' : 'No computador'}
          </span>
          {duracao && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span aria-hidden="true">{duracao}</span>
              <span className="sr-only">{duracaoPorExtenso(feature.duration_s)}</span>
            </span>
          )}
          {soTexto && <Badge>{SELO_TEXTO}</Badge>}
        </span>
      </span>
    </Link>
  );
}
