'use client';
import { useMemo, useState } from 'react';
import { format, isToday, isYesterday, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCheck, Download, Inbox, Send, ShieldCheck } from 'lucide-react';
import { ResponsavelShell } from '@/app/components/ResponsavelShell';
import { ResponsavelChamadoModal } from '@/app/components/ResponsavelChamadoModal';
import { Button, Skeleton } from '@/app/components/ui';
import { ChipSelect, chipBase, CHIP_PAD } from '@/app/components/ChipSelect';
import { useMyTickets } from '@/app/hooks/useApi';
import { MAINTENANCE_TYPES, PRIORITIES, labelOf } from '@/app/lib/maintenanceOptions';
import { TIPOS_DE_EVENTO, eventosDaAtividade, prediosDaLista } from '@/app/lib/chamadosDoResponsavel';
import { baixarCsv } from '@/app/lib/csv';
import { T, R, W, NUM } from '@/app/lib/theme';

const ICONE = { ENCAMINHADO: Send, RECEBIDO: Inbox, CONCLUIDO: CheckCheck, FECHADO: ShieldCheck };

const FILTROS_DE_TIPO = [
  { id: 'TODOS', label: 'Tudo' },
  { id: 'RECEBIDO', label: 'Recebidos' },
  { id: 'CONCLUIDO', label: 'Concluídos' },
  { id: 'FECHADO', label: 'Finalizados' },
  { id: 'ENCAMINHADO', label: 'Encaminhados' },
];

const PERIODOS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: 'TUDO', label: 'Todo o período' },
];

const TODOS = 'TODOS';
const PERIODO_PADRAO = '30';

/** Quantos eventos entram de cada vez. */
const PASSO = 40;

function rotuloDoDia(data) {
  if (isToday(data)) return 'Hoje';
  if (isYesterday(data)) return 'Ontem';
  // Só a primeira letra: `text-transform: capitalize` subiria o "De" também.
  const texto = format(data, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Os filtros de tipo: botões de alternar, com o número de cada um no recorte.
 *
 * Na medida dos chips das outras mesas (`chipBase`), e aceso no dourado suave
 * como eles — não no dourado cheio, que no produto é do botão de ação.
 */
function FiltroDeTipo({ atual, onPick, contagem }) {
  return (
    <div role="group" aria-label="Tipo de atividade" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {FILTROS_DE_TIPO.map((f) => {
        const ativo = f.id === atual;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={ativo}
            onClick={() => onPick(f.id)}
            style={{
              // 34px, a altura do gatilho do `ChipSelect` ao lado: com o recuo
              // do chip só, os botões ficavam 5px mais baixos na mesma linha.
              ...chipBase, gap: 6, padding: CHIP_PAD, height: 34, border: 'none', cursor: 'pointer',
              background: ativo ? T.accentSoft : T.chip,
              color: ativo ? T.accentInk : T.mute, fontFamily: 'inherit',
              transition: 'background 120ms, color 120ms',
            }}
          >
            {f.label}
            <span style={{ fontSize: 12, color: ativo ? T.accentInk : T.faint, ...NUM }}>{contagem[f.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Minha atividade: o que o responsável fez, e o que aconteceu com o trabalho
 * dele, do mais recente para o mais antigo.
 *
 * É a conta dele, e não a do prédio — por isso mora numa aba separada do
 * histórico do prédio. Os gestos do moderador que mexem no trabalho dele
 * (encaminhar, finalizar) entram na lista marcados como do moderador, porque
 * sem eles a história fica com buracos: "você concluiu" sem o "foi finalizado"
 * depois não diz se a entrega foi aceita.
 *
 * Os passos da linha do tempo de cada chamado não entram aqui: moram dentro do
 * chamado, e abrir o evento mostra todos eles.
 */
export default function AtividadeDoResponsavelPage() {
  const { data, isLoading } = useMyTickets(true, true);
  const tickets = useMemo(() => data?.tickets ?? [], [data]);

  const [tipo, setTipo] = useState(TODOS);
  const [periodo, setPeriodo] = useState(PERIODO_PADRAO);
  const [predio, setPredio] = useState('');
  const [limite, setLimite] = useState(PASSO);
  const [aberto, setAberto] = useState(null);

  const predios = prediosDaLista(tickets);
  const todos = useMemo(() => eventosDaAtividade(tickets), [tickets]);

  // O recorte de período e prédio vale para os números dos botões; o de tipo,
  // só para a lista — senão cada botão mostraria zero em todos os outros tipos.
  const desde = periodo === 'TUDO' ? 0 : subDays(new Date(), Number(periodo)).getTime();
  const noRecorte = todos.filter(
    (e) => e.ms >= desde && (!predio || e.ticket.report?.building?.id === predio)
  );
  const contagem = noRecorte.reduce(
    (acc, e) => ({ ...acc, [e.tipo]: (acc[e.tipo] ?? 0) + 1 }),
    { TODOS: noRecorte.length }
  );
  const lista = tipo === TODOS ? noRecorte : noRecorte.filter((e) => e.tipo === tipo);
  const mostrados = lista.slice(0, limite);

  // Agrupados pelo dia, na ordem em que já vêm.
  const dias = [];
  for (const e of mostrados) {
    const chave = format(new Date(e.quando), 'yyyy-MM-dd');
    const ultimo = dias[dias.length - 1];
    if (ultimo?.chave === chave) ultimo.eventos.push(e);
    else dias.push({ chave, data: new Date(e.quando), eventos: [e] });
  }

  function exportar() {
    baixarCsv(
      'minha-atividade',
      [
        { titulo: 'Data', valor: (e) => format(new Date(e.quando), 'dd/MM/yyyy HH:mm') },
        { titulo: 'Atividade', valor: (e) => TIPOS_DE_EVENTO[e.tipo].label },
        { titulo: 'Prédio', valor: (e) => e.ticket.report?.building?.name ?? '' },
        { titulo: 'Andar', valor: (e) => e.ticket.floor?.label ?? '' },
        { titulo: 'Tipo de manutenção', valor: (e) => labelOf(MAINTENANCE_TYPES, e.ticket.maintenance_type) },
        { titulo: 'Prioridade', valor: (e) => labelOf(PRIORITIES, e.ticket.priority) },
        { titulo: 'Descrição', valor: (e) => e.ticket.description ?? '' },
      ],
      lista
    );
  }

  function mudar(setter) {
    return (valor) => { setter(valor); setLimite(PASSO); };
  }

  return (
    <ResponsavelShell
      title="Minha atividade"
      subtitle="O que você fez nos chamados, e o que aconteceu com o seu trabalho"
      actions={
        <button type="button" onClick={exportar} disabled={lista.length === 0} className="flex items-center gap-2 px-4 py-2 bg-chip rounded-control text-mute text-sm hover:text-ink transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
          <Download size={15} /> Exportar CSV
        </button>
      }
    >
      <div style={{ padding: '0 32px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <FiltroDeTipo atual={tipo} onPick={mudar(setTipo)} contagem={contagem} />
        <div style={{ display: 'flex', gap: 8 }}>
          {predios.length > 1 && (
            <ChipSelect
              label="Prédio"
              todos="Todos os prédios"
              options={predios.map((b) => ({ value: b.id, label: b.name }))}
              value={predio}
              onChange={mudar(setPredio)}
            />
          )}
          {/* O período nunca é vazio: acende só quando sai do padrão. */}
          <ChipSelect
            label="Período"
            options={PERIODOS}
            value={periodo}
            onChange={mudar(setPeriodo)}
            ativo={periodo !== PERIODO_PADRAO}
          />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 32px 32px' }}>
        <div style={{ maxWidth: 880 }}>
          {isLoading && [1, 2, 3, 4].map((i) => <Skeleton key={i} style={{ height: 64, borderRadius: R.control, marginBottom: 8 }} />)}

          {!isLoading && lista.length === 0 && (
            <div className="anim-fade-up" style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: '44px 20px', textAlign: 'center' }}>
              <p style={{ color: T.text, fontWeight: W.title, fontSize: 15 }}>Nenhuma atividade neste recorte</p>
              <p style={{ color: T.mute, fontSize: 13, marginTop: 6 }}>
                Troque o período ou o tipo para ver mais.
              </p>
            </div>
          )}

          {dias.map((dia, di) => (
            <section key={dia.chave} className={`anim-fade-up anim-d${Math.min(di + 1, 6)}`} style={{ marginBottom: 18 }}>
              <h2 style={{ color: T.mute, fontSize: 12, fontWeight: W.title, margin: '0 0 8px 4px' }}>
                {rotuloDoDia(dia.data)}
              </h2>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, background: T.card, borderRadius: R.card, boxShadow: T.cardRing, overflow: 'hidden' }}>
                {dia.eventos.map((e, i) => {
                  const Icone = ICONE[e.tipo];
                  const def = TIPOS_DE_EVENTO[e.tipo];
                  const doModerador = def.quem === 'moderador';
                  return (
                    <li key={e.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${T.line}` }}>
                      <button
                        type="button"
                        className="linha-clicavel"
                        onClick={() => setAberto(e.ticket)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px',
                          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                          font: 'inherit', color: 'inherit',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 34, height: 34, borderRadius: 999, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: doModerador ? T.chip : T.accentSoft,
                          }}
                        >
                          <Icone size={16} color={doModerador ? T.mute : T.accentInk} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', color: T.text, fontSize: 14 }}>
                            <strong style={{ fontWeight: W.title }}>{def.label}</strong>
                            {' · '}
                            {e.ticket.floor?.label ?? 'Andar'} · {labelOf(MAINTENANCE_TYPES, e.ticket.maintenance_type)}
                          </span>
                          <span style={{ display: 'block', color: T.faint, fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.ticket.report?.building?.name}
                            {e.tipo === 'FECHADO' && e.ticket.closed_by?.name ? ` · por ${e.ticket.closed_by.name}` : ''}
                            {' · '}
                            {e.ticket.description}
                          </span>
                        </span>
                        <time dateTime={e.quando} style={{ color: T.faint, fontSize: 12, flexShrink: 0, ...NUM }}>
                          {format(new Date(e.quando), 'HH:mm')}
                        </time>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          {lista.length > limite && (
            <Button variant="secondary" onClick={() => setLimite((n) => n + PASSO)} style={{ width: '100%', padding: '9px 14px', fontSize: 13 }}>
              Mostrar mais ({lista.length - limite})
            </Button>
          )}
        </div>
      </div>

      <ResponsavelChamadoModal
        open={!!aberto}
        ticketId={aberto?.id}
        inicial={aberto}
        onClose={() => setAberto(null)}
      />
    </ResponsavelShell>
  );
}
