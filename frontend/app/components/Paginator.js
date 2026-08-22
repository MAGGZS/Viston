'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pageRangeLabel } from '@/app/lib/pagination';
import { T, R, W } from '@/app/lib/theme';

/**
 * O rodapé de quem tem mais registros do que cabe no cartão.
 *
 * Substituiu o "Carregar mais". Ele empilhava página sobre página até a lista
 * ficar mais alta que a tela, e a coluna ao lado — calendário, contadores —
 * acabava pendurada num vazio de mil pixels. Com as setas, o cartão tem sempre
 * a mesma altura, e o que passou continua a um clique de distância.
 *
 * As setas ficam à direita e o intervalo à esquerda: o número diz o tamanho do
 * que se está percorrendo, que é o que decide se vale continuar clicando.
 */
export function Paginator({
  page,
  pages,
  total,
  count,
  pageSize,
  onPrev,
  onNext,
  isFetching = false,
  className = '',
  style = {},
}) {
  // Uma página só não é navegação nenhuma: o rodapé sairia como um enfeite que
  // não faz nada, e ainda ocuparia a linha.
  if (!pages || pages <= 1) return null;

  const hasPrev = page > 1;
  const hasNext = page < pages;

  return (
    <nav
      aria-label="Paginação do histórico"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 16px',
        ...style,
      }}
    >
      {/*
        `aria-live`: quem não vê a tela precisa saber onde caiu depois de
        apertar a seta — sem isto, o clique não anuncia nada e a lista trocou
        em silêncio.
      */}
      <span aria-live="polite" style={{ color: T.mute, fontSize: 12, opacity: isFetching ? 0.5 : 1 }}>
        {pageRangeLabel({ page, pageSize, total, count })}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <PagerButton
          label="Página anterior"
          onClick={onPrev}
          disabled={!hasPrev || isFetching}
        >
          <ChevronLeft size={16} />
        </PagerButton>

        <span style={{ color: T.faint, fontSize: 12, fontWeight: W.body, minWidth: 44, textAlign: 'center', ...NUMERIC }}>
          {page} / {pages}
        </span>

        <PagerButton
          label="Próxima página"
          onClick={onNext}
          disabled={!hasNext || isFetching}
        >
          <ChevronRight size={16} />
        </PagerButton>
      </div>
    </nav>
  );
}

/** Dígitos que alinham entre uma página e outra — "1 / 9" não pode dançar. */
const NUMERIC = { fontVariantNumeric: 'tabular-nums' };

/**
 * Alvo de 34px, o mesmo das setas do calendário.
 *
 * `<button>` de verdade, com `aria-label` e `disabled` nas pontas: uma seta que
 * some no fim da lista faz a pessoa procurar o que sumiu; uma que fica e não
 * responde diz que ali acabou.
 */
function PagerButton({ children, label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="pager-btn"
      style={{
        width: 34,
        height: 34,
        borderRadius: R.pill,
        border: 'none',
        background: T.chip,
        color: T.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
  );
}
