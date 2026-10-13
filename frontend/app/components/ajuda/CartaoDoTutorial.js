'use client';
import Link from 'next/link';
import { ListOrdered, Monitor, PlayCircle, Smartphone } from 'lucide-react';
import { Badge } from '@/app/components/ui';
import { SELO_TEXTO, cartaoSemVideo, duracaoPorExtenso, formatarDuracao } from '@/app/lib/ajuda';
import { T, W } from '@/app/lib/theme';

/**
 * Um tutorial de uma pasta, em cartão: na tela da pasta (telefone e
 * computador) e no início da central no computador, com os do seu cargo.
 *
 * Cada cartão diz o que a pessoa precisa para decidir se abre agora: o
 * título, o resumo, quanto tempo leva o vídeo (ou que é passo a passo em
 * texto, quando ainda não há vídeo) e se foi feito no celular ou no
 * computador. Este último não é enfeite: o inspetor que abre no computador um
 * tutorial gravado no celular precisa saber que os botões vão estar em outro
 * lugar na tela dele.
 *
 * A capa entra quando existe, com proporção fixa, para o cartão não mudar de
 * altura quando a imagem chega. Sem capa, um ícone ocupa o mesmo lugar e o
 * alinhamento da lista não muda: o de reproduzir quando há vídeo, o de lista
 * numerada quando o tutorial é só texto, que aí também troca a duração pelo
 * selo "Passo a passo em texto". Um "0:00" ou um botão de play num tutorial
 * sem vídeo prometeria o que a tela seguinte não tem.
 */
export function CartaoDoTutorial({ pasta, feature }) {
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

/** A lista de cartões de uma pasta. */
export function ListaDeTutoriais({ pasta, features, rotulo, className = '' }) {
  return (
    <ul aria-label={rotulo} className={`ajuda-lista ${className}`.trim()}>
      {features.map((f) => (
        <li key={f.id}>
          <CartaoDoTutorial pasta={pasta} feature={f} />
        </li>
      ))}
    </ul>
  );
}
