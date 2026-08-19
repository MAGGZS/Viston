'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MRound } from '@/app/components/mobile/kit';
import { Badge, Modal, Skeleton } from '@/app/components/ui';
import { useBuildingOccurrences } from '@/app/hooks/useApi';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
  OCCURRENCE_STATUS_LABEL,
  RECORD_STATUS_VARIANT,
  labelOf,
  formatCost,
} from '@/app/lib/maintenanceOptions';
import { parseReportDate } from '@/app/lib/date';
import { T, W } from '@/app/lib/theme';

const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

/** O dia da vistoria que abriu a ocorrência, por extenso. */
function dayLabel(value) {
  const date = parseReportDate(value);
  return date ? format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '—';
}

/** O mesmo dia curto da tabela de vistorias. */
function shortDay(value) {
  const date = parseReportDate(value);
  return date ? format(date, 'dd/MM/yyyy', { locale: ptBR }) : '—';
}

/** Dia de um carimbo do chamado (encaminhado, recebido, concluído, fechado). */
function stampLabel(value) {
  return value ? format(new Date(value), 'dd/MM/yyyy', { locale: ptBR }) : '—';
}

/**
 * As duas leituras do mesmo histórico.
 *
 * São a mesma pergunta feita de dois jeitos — "o que foi vistoriado" e "o que
 * foi encontrado" —, e por isso dividem o cartão em vez de virar duas telas: a
 * segunda não tem calendário, filtro nem navegação própria, e uma aba a mais
 * cobraria uma escolha antes de a pessoa ver qualquer coisa.
 *
 * Vistorias é a primeira porque é o que existia: quem abre o histórico
 * continua caindo onde sempre caiu.
 */
export const HISTORICO_VIEWS = [
  { key: 'VISTORIAS', title: 'Histórico de vistorias', eyebrow: 'Vistorias concluídas' },
  { key: 'OCORRENCIAS', title: 'Histórico de ocorrências', eyebrow: 'Ocorrências do prédio' },
];

/**
 * Qual das duas visões está aberta.
 *
 * Mora em quem desenha a tela, e não dentro do alternador, por dois motivos: o
 * título de fora (o eyebrow da barra do topo) acompanha a visão ativa, e os
 * modais de relatório abrem e fecham sem levar a escolha junto.
 */
export function useHistoricoView() {
  const [index, setIndex] = useState(0);

  // Circular de propósito: com duas visões, "a próxima" e "a anterior" são a
  // mesma, e desabilitar uma seta faria a pessoa procurar qual das duas ainda
  // funciona.
  function move(step) {
    setIndex((i) => (i + step + HISTORICO_VIEWS.length) % HISTORICO_VIEWS.length);
  }

  const current = HISTORICO_VIEWS[index];
  return {
    view: current.key,
    title: current.title,
    eyebrow: current.eyebrow,
    isVistorias: current.key === 'VISTORIAS',
    prev: () => move(-1),
    next: () => move(1),
  };
}

/**
 * O cabeçalho do cartão: o título entre as duas setas.
 *
 * Não é um `MSectionHead` porque ele põe tudo o que não é título à direita, e
 * aqui há uma seta de cada lado. Os botões continuam sendo os do kit — o mesmo
 * redondo das ações da barra do topo, com a mesma área de toque.
 */
export function HistoricoSwitcher({ title, subtitle, onPrev, onNext, className = '' }) {
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <MRound label="Ver o histórico anterior" onClick={onPrev}>
        <ChevronLeft size={18} />
      </MRound>

      <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        {/* `key` no título: é o que faz a animação tocar de novo a cada troca —
            sem ele o texto mudaria seco, no meio de duas setas paradas. */}
        <h2
          key={title}
          className="anim-fade-down"
          style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 16, color: T.text }}
        >
          {title}
        </h2>
        {subtitle && (
          <p key={subtitle} className="anim-fade-down" style={{ color: T.faint, fontSize: 11, marginTop: 2 }}>
            {subtitle}
          </p>
        )}
      </div>

      <MRound label="Ver o próximo histórico" onClick={onNext}>
        <ChevronRight size={18} />
      </MRound>
    </div>
  );
}

/** Um par rótulo/valor do detalhe. */
function Fact({ label, children }) {
  return (
    <div>
      <p style={{ color: T.mute, fontSize: 11 }}>{label}</p>
      <div style={{ color: T.text, fontSize: 13, marginTop: 3, fontWeight: W.strong }}>{children}</div>
    </div>
  );
}

/**
 * A ocorrência inteira — é aqui que mora a descrição.
 *
 * Ela saiu da lista porque um parágrafo por linha fazia o histórico virar uma
 * parede de texto: quem percorre quer achar a ocorrência, e quem achou quer
 * lê-la toda. Só leitura, como o resto desta visão: nenhuma ação do chamado
 * aparece aqui, nem para o moderador nem para o gestor.
 */
export function OcorrenciaModal({ occurrence, open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Ocorrência" maxWidth={560}>
      {occurrence && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Badge variant={PRIORITY_VARIANT[occurrence.priority] ?? 'default'}>
                {labelOf(PRIORITIES, occurrence.priority)}
              </Badge>
              <Badge variant={RECORD_STATUS_VARIANT[occurrence.status] ?? 'default'}>
                {OCCURRENCE_STATUS_LABEL[occurrence.status] ?? occurrence.status}
              </Badge>
            </div>
            <h3 style={{ color: T.text, fontSize: 18, fontWeight: W.title, marginTop: 10 }}>
              {labelOf(MAINTENANCE_TYPES, occurrence.maintenance_type)}
            </h3>
            <p style={{ color: T.mute, fontSize: 12, marginTop: 3 }}>
              {occurrence.floor?.label} · {labelOf(CATEGORIES, occurrence.category)}
            </p>
          </div>

          <div>
            <p style={{ color: T.mute, fontSize: 11, marginBottom: 6 }}>O que está acontecendo</p>
            <p style={{ color: T.text, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {occurrence.description}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
            <Fact label="Relatado em">{dayLabel(occurrence.report?.date)}</Fact>
            <Fact label="Vistoriado por">{occurrence.report?.inspector?.name ?? '—'}</Fact>
            <Fact label="Responsável">{occurrence.responsible ?? 'Sem responsável'}</Fact>
            {occurrence.forwarded_at && <Fact label="Encaminhado em">{stampLabel(occurrence.forwarded_at)}</Fact>}
            {occurrence.received_at && <Fact label="Recebido em">{stampLabel(occurrence.received_at)}</Fact>}
            {occurrence.done_at && <Fact label="Concluído pelo responsável">{stampLabel(occurrence.done_at)}</Fact>}
            {occurrence.closed_at && <Fact label="Fechado em">{stampLabel(occurrence.closed_at)}</Fact>}
            {occurrence.closed_by && <Fact label="Fechado por">{occurrence.closed_by.name}</Fact>}
          </div>

          {(occurrence.maintenance_note || occurrence.maintenance_cost !== null) && (
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {occurrence.maintenance_note && (
                <div>
                  <p style={{ color: T.mute, fontSize: 11, marginBottom: 5 }}>Manutenção</p>
                  <p style={{ color: T.text, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {occurrence.maintenance_note}
                  </p>
                </div>
              )}
              {occurrence.maintenance_cost !== null && occurrence.maintenance_cost !== undefined && (
                <Fact label="Valor">{formatCost(occurrence.maintenance_cost)}</Fact>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * As ocorrências do prédio e a que está aberta no modal.
 *
 * As duas formas da lista — cartão e tabela — partilham isto para não
 * divergirem no que é a mesma leitura: mesma consulta, mesmo estado, mesma
 * ordem (do mais recente para o mais antigo, como o repositório devolve).
 *
 * Só leitura: nenhum botão de encaminhar, receber ou fechar mora aqui. Quem
 * trata chamado tem a mesa dele — esta lista é para saber o que já foi
 * encontrado no prédio, e é isso que a torna livre para qualquer vínculo.
 */
function useOcorrencias(buildingId) {
  const { data, isLoading } = useBuildingOccurrences(buildingId);
  const [picked, setPicked] = useState(null);

  return {
    occurrences: data?.tickets ?? [],
    isLoading: !!buildingId && isLoading,
    picked,
    open: setPicked,
    close: () => setPicked(null),
  };
}

const EMPTY_MESSAGE = 'Nenhuma ocorrência neste prédio ainda';
const NO_BUILDING_MESSAGE = 'As ocorrências são de um prédio — esta conta não está vinculada a nenhum';

/**
 * Uma ocorrência na lista, com a mesma forma do cartão de vistoria: o que é em
 * cima, o contexto embaixo, as etiquetas no rodapé e a seta dizendo que abre.
 */
function OcorrenciaCard({ occurrence, onOpen, className = '' }) {
  return (
    <div
      onClick={() => onOpen(occurrence)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(occurrence)}
      className={className}
      style={{ background: T.card, borderRadius: 26, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: 'background 0.15s' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.chip; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = T.card; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ color: T.text, fontWeight: W.title, fontSize: 14 }}>
            {occurrence.floor?.label ?? 'Andar não informado'} ·{' '}
            {labelOf(MAINTENANCE_TYPES, occurrence.maintenance_type)}
          </p>
          <p style={{ color: T.mute, fontSize: 12, marginTop: 2 }}>
            {labelOf(CATEGORIES, occurrence.category)} · {dayLabel(occurrence.report?.date)}
          </p>
        </div>
        <ChevronRight size={18} color={T.faint} style={{ flexShrink: 0 }} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Badge variant={RECORD_STATUS_VARIANT[occurrence.status] ?? 'default'}>
          {OCCURRENCE_STATUS_LABEL[occurrence.status] ?? occurrence.status}
        </Badge>
        <Badge variant={PRIORITY_VARIANT[occurrence.priority] ?? 'default'}>
          {labelOf(PRIORITIES, occurrence.priority)}
        </Badge>
      </div>
    </div>
  );
}

/** As ocorrências em cartões — a forma da lista de vistorias do histórico. */
export function OcorrenciasList({ buildingId }) {
  const { occurrences, isLoading, picked, open, close } = useOcorrencias(buildingId);

  if (!buildingId) {
    return <p style={{ color: T.faint, fontSize: 14, textAlign: 'center', padding: '60px 0' }}>{NO_BUILDING_MESSAGE}</p>;
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="anim-fade-in" style={{ height: 116, borderRadius: 26 }} />
        ))}
      </div>
    );
  }

  if (occurrences.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <p className="anim-pop-in" style={{ fontSize: 36, marginBottom: 12 }}>🧾</p>
        <p className="anim-fade-up anim-d1" style={{ color: T.faint, fontSize: 14 }}>{EMPTY_MESSAGE}</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {occurrences.map((o, idx) => (
          <OcorrenciaCard
            key={o.id}
            occurrence={o}
            onOpen={open}
            className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
          />
        ))}
      </div>

      <OcorrenciaModal open={!!picked} occurrence={picked} onClose={close} />
    </>
  );
}

const TABLE_HEAD = ['Andar', 'Tipo', 'Status', 'Dia'];
const CELL = { padding: '11px 22px', fontSize: 13 };

/**
 * As ocorrências em tabela — a forma do histórico de relatórios do painel.
 *
 * As mesmas quatro colunas em espírito: o que identifica a linha, o que ela é,
 * onde está e de quando é. A descrição não vem: ela abre no modal, como o
 * relatório do dia abre ao clicar na linha de uma vistoria.
 */
export function OcorrenciasTable({ buildingId }) {
  const { occurrences, isLoading, picked, open, close } = useOcorrencias(buildingId);

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            {TABLE_HEAD.map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 22px', color: T.mute, fontSize: 11, fontWeight: W.body }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading && [1, 2, 3].map((i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${T.line}` }}>
              {TABLE_HEAD.map((h) => (
                <td key={h} style={{ padding: '10px 22px' }}><Skeleton style={{ height: 14 }} /></td>
              ))}
            </tr>
          ))}

          {occurrences.map((o, idx) => (
            <tr
              key={o.id}
              onClick={() => open(o)}
              className={`anim-fade-in anim-d${Math.min(idx + 1, 6)}`}
              style={{ borderBottom: `1px solid ${T.line}`, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.chip; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <td style={{ ...CELL, color: T.text }}>{o.floor?.label ?? '—'}</td>
              <td style={{ ...CELL, color: T.text }}>{labelOf(MAINTENANCE_TYPES, o.maintenance_type)}</td>
              <td style={{ ...CELL }}>
                <Badge variant={RECORD_STATUS_VARIANT[o.status] ?? 'default'}>
                  {OCCURRENCE_STATUS_LABEL[o.status] ?? o.status}
                </Badge>
              </td>
              {/* Só o dia, como na tabela de vistorias: a ocorrência é do
                  relatório daquele dia. */}
              <td style={{ ...CELL, color: T.mute }}>{shortDay(o.report?.date)}</td>
            </tr>
          ))}

          {!isLoading && occurrences.length === 0 && (
            <tr>
              <td colSpan={TABLE_HEAD.length} style={{ padding: '40px 22px', textAlign: 'center', color: T.mute, fontSize: 13 }}>
                {buildingId ? EMPTY_MESSAGE : NO_BUILDING_MESSAGE}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <OcorrenciaModal open={!!picked} occurrence={picked} onClose={close} />
    </>
  );
}
