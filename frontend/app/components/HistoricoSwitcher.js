'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MRound } from '@/app/components/mobile/kit';
import { Badge, Skeleton } from '@/app/components/ui';
import { OcorrenciaModal, dayLabel } from '@/app/components/OcorrenciaModal';
import { useBuildingOccurrences } from '@/app/hooks/useApi';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
  OCCURRENCE_STATUS_LABEL,
  RECORD_STATUS_VARIANT,
  labelOf,
} from '@/app/lib/maintenanceOptions';
import { T, W } from '@/app/lib/theme';

const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

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
          <p key={subtitle} className="anim-fade-down" style={{ color: T.faint, fontSize: 12, marginTop: 2 }}>
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
