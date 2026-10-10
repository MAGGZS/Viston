'use client';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { parseReportDate } from '@/app/lib/date';
import { T, R, W } from '@/app/lib/theme';

/**
 * "Ana Ribeiro", "Ana Ribeiro e Carlos Pereira", "Ana, Bia e Carlos".
 *
 * A barra ("A / B / C") é o jeito da planilha, que copia a linha do papel. Em
 * frase corrida ela se lê como alternativa ("A ou B"), e aqui a frase quer dizer
 * o contrário: foram todos.
 */
export function listaDeNomes(nomes) {
  const limpos = (nomes ?? []).filter(Boolean);
  if (limpos.length <= 1) return limpos[0] ?? '';
  return `${limpos.slice(0, -1).join(', ')} e ${limpos[limpos.length - 1]}`;
}

/**
 * O aviso do topo do relatório do dia.
 *
 * O relatório deixou de ser de uma vistoria e passou a ser do dia (ver
 * `buildDayReport`, no backend): abrir qualquer vistoria de uma data abre todas
 * as daquele prédio naquela data, juntas. A tela não dizia isso. Quem abria a
 * própria vistoria e encontrava ocorrências de outra pessoa achava que o
 * relatório estava errado, ou que alguém tinha mexido no que ele enviou.
 *
 * Por isso a frase vem antes de qualquer número, com a data escrita como a
 * pessoa a escreveria à mão (DD/MM/AAAA), e logo abaixo os nomes de quem
 * vistoriou, que é a resposta para "de onde veio isso?".
 *
 * Só tela: a planilha já tem a linha "Inspeção feita por" desde que passou a
 * ser do dia, e não muda aqui.
 */
export function AvisoRelatorioDoDia({ report, style }) {
  const dia = parseReportDate(report?.date);
  const nomes = listaDeNomes(report?.inspectors);

  return (
    <div
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        background: T.chip, borderRadius: R.control, padding: '12px 14px',
        ...style,
      }}
    >
      <CalendarDays size={16} color={T.accentInk} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <p style={{ color: T.text, fontSize: 14, lineHeight: 1.5, margin: 0 }}>
          {dia ? (
            <>
              Este relatório junta todas as vistorias do prédio em{' '}
              <strong style={{ fontWeight: W.strong }}>{format(dia, 'dd/MM/yyyy')}</strong>.
            </>
          ) : (
            // Sem data, a frase não inventa uma: diz o que o relatório junta, e
            // "data não informada" em negrito parecia um dado do prédio.
            'Este relatório junta todas as vistorias do prédio no mesmo dia.'
          )}
        </p>
        <p style={{ color: T.mute, fontSize: 13, lineHeight: 1.5, marginTop: 2, marginBottom: 0 }}>
          {nomes ? `Vistoriado por ${nomes}.` : 'Vistoriado por pessoa não identificada.'}
        </p>
      </div>
    </div>
  );
}
