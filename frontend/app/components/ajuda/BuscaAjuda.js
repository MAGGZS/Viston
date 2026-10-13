'use client';
import { useId, useRef } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { linkDaAba } from '@/app/lib/ajuda';
import { mensagemDoErro } from '@/app/lib/erros';
import { T, W } from '@/app/lib/theme';

/**
 * O campo da busca da central, o mesmo no telefone (no topo da central) e no
 * computador (no topo da coluna da árvore). O que muda é só o tamanho e se o
 * rótulo aparece: na coluna estreita ele vai só para o leitor de tela, e a
 * lupa com o texto de exemplo dizem o que o campo é.
 *
 * A linha de situação é anunciada (`aria-live`): quem usa leitor de tela
 * digita e precisa ouvir quantos resultados vieram sem ter de sair do campo
 * para procurá-los.
 */
export function CampoDeBusca({ termo, onTermo, rotulo, rotuloVisivel = true, placeholder, situacao, compacto = false, className = '', style }) {
  const campo = useRef(null);
  const campoId = useId();
  const dicaId = useId();

  return (
    <form
      role="search"
      aria-label="Buscar nos tutoriais"
      onSubmit={(e) => e.preventDefault()}
      className={className}
      style={style}
    >
      <label
        htmlFor={campoId}
        className={rotuloVisivel ? undefined : 'sr-only'}
        style={rotuloVisivel ? { display: 'block', color: T.mute, fontSize: 13, marginBottom: 8 } : undefined}
      >
        {rotulo}
      </label>
      <div style={{ position: 'relative' }}>
        <Search
          size={compacto ? 16 : 18}
          color={T.mute}
          aria-hidden="true"
          style={{ position: 'absolute', left: compacto ? 12 : 15, top: '50%', transform: 'translateY(-50%)' }}
        />
        <input
          ref={campo}
          id={campoId}
          type="search"
          value={termo}
          onChange={(e) => onTermo(e.target.value)}
          placeholder={placeholder}
          maxLength={100}
          autoComplete="off"
          aria-describedby={dicaId}
          className={compacto ? 'ajuda-busca ajuda-busca--compacta' : 'ajuda-busca'}
        />
        {termo && (
          <button
            type="button"
            onClick={() => {
              onTermo('');
              // O botão some com o campo vazio, e o foco cairia no `body`.
              campo.current?.focus();
            }}
            aria-label="Limpar a busca"
            className="icone-btn icone-btn--compacto"
            // Centrado pela margem, e não por `transform`: um `transform`
            // inline anularia o `scale` do `:active` do `.icone-btn`.
            style={{ position: 'absolute', right: compacto ? 2 : 4, top: 0, bottom: 0, margin: 'auto 0' }}
          >
            <X size={compacto ? 15 : 16} aria-hidden="true" />
          </button>
        )}
      </div>
      <p
        id={dicaId}
        aria-live="polite"
        style={{ color: T.mute, fontSize: compacto ? 12 : 13, lineHeight: 1.45, marginTop: compacto ? 6 : 8, minHeight: compacto ? 0 : 18 }}
      >
        {situacao}
      </p>
    </form>
  );
}

/**
 * A linha de situação da busca.
 *
 * `tutoriais`, quando vem, é quantos tutoriais a árvore do computador mostra
 * filtrados pelo termo: lá a busca acha tutoriais pelo título e passos pelo
 * texto, e a linha conta os dois. No telefone só há os passos.
 */
export function situacaoDaBusca(termo, q, busca, tutoriais = null) {
  const digitado = termo.trim();
  if (!digitado) return '';
  if (digitado.length < 2) return 'Digite ao menos 2 letras.';
  if (busca.isError) return mensagemDoErro(busca.error, 'Não foi possível buscar agora. Tente de novo.');
  if (busca.isFetching || q !== digitado) return 'Buscando...';
  const n = busca.data?.results?.length ?? 0;

  if (tutoriais === null) {
    if (n === 0) return `Nenhum passo fala de "${q}". Tente outra palavra, ou abra a pasta do seu cargo.`;
    return n === 1 ? '1 passo encontrado.' : `${n} passos encontrados.`;
  }

  if (n === 0 && tutoriais === 0) return `Nada encontrado para "${q}". Tente outra palavra.`;
  const partes = [];
  if (tutoriais > 0) partes.push(tutoriais === 1 ? '1 tutorial' : `${tutoriais} tutoriais`);
  if (n > 0) partes.push(n === 1 ? '1 passo' : `${n} passos`);
  return `${partes.join(' e ')} ${tutoriais + n === 1 ? 'encontrado' : 'encontrados'}.`;
}

/**
 * Os resultados da busca. Cada resultado é uma aba, e o link leva direto a ela
 * (`?passo=N`): quem procura "código do prédio" quer o passo em que se digita
 * o código, e não o começo de um vídeo de um minuto.
 *
 * `compacto` é a versão da coluna da árvore: o trecho fica em duas linhas, e
 * o nome da pasta sai, porque o tutorial já diz de onde é.
 */
export function ResultadosDaBusca({ resultados, compacto = false, rotulo = 'Resultados da busca' }) {
  if (resultados.length === 0) return null;

  return (
    <ul aria-label={rotulo} className={compacto ? 'ajuda-resultados ajuda-resultados--compactos' : 'ajuda-resultados'}>
      {resultados.map((r) => (
        <li key={`${r.feature_slug}-${r.step_order}`}>
          <Link
            href={linkDaAba(r.folder_slug, r.feature_slug, r.step_order)}
            className={compacto ? 'ajuda-resultado' : 'ajuda-cartao'}
            style={compacto ? undefined : { display: 'block', padding: '14px 16px' }}
          >
            <span style={{ display: 'block', color: T.mute, fontSize: 12 }}>
              {compacto ? r.feature_title : `${r.folder_title} · ${r.feature_title}`}
            </span>
            <span style={{ display: 'block', color: T.text, fontSize: compacto ? 13 : 15, fontWeight: W.strong, marginTop: compacto ? 2 : 4, lineHeight: 1.4 }}>
              Passo {r.step_order}. {r.step_title}
            </span>
            {r.snippet && (
              <span
                className={compacto ? 'ajuda-resultado__trecho' : undefined}
                style={{ display: compacto ? undefined : 'block', color: T.mute, fontSize: compacto ? 12 : 14, lineHeight: 1.5, marginTop: compacto ? 2 : 4 }}
              >
                {r.snippet}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
