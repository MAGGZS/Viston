'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { M, MRound, MCard } from '@/app/components/mobile/kit';
import { Badge, Skeleton } from '@/app/components/ui';
import { useBuildingOccurrences } from '@/app/hooks/useApi';
import {
  MAINTENANCE_TYPES,
  OCCURRENCE_STATUS_LABEL,
  RECORD_STATUS_VARIANT,
  labelOf,
} from '@/app/lib/maintenanceOptions';
import { parseReportDate } from '@/app/lib/date';

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
          style={{ fontFamily: M.display, fontWeight: 600, fontSize: 16, color: M.text }}
        >
          {title}
        </h2>
        {subtitle && (
          <p key={subtitle} className="anim-fade-down" style={{ color: M.faint, fontSize: 11, marginTop: 2 }}>
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

/** Uma ocorrência da lista: onde foi, o que era, e onde o chamado parou. */
function OcorrenciaCard({ occurrence, className = '' }) {
  const day = parseReportDate(occurrence.report?.date);

  return (
    <MCard className={className} style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.text, minWidth: 0 }}>
          {occurrence.floor?.label ?? 'Andar não informado'}
        </p>
        <Badge variant={RECORD_STATUS_VARIANT[occurrence.status] ?? 'default'}>
          {OCCURRENCE_STATUS_LABEL[occurrence.status] ?? occurrence.status}
        </Badge>
      </div>

      {/* Resumida: o histórico é para percorrer. Quem precisa do texto inteiro
          abre o relatório do dia, que é onde ele está. */}
      <p style={{
        color: M.mute, fontSize: 12.5, lineHeight: 1.55,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {occurrence.description}
      </p>

      <p style={{ color: M.faint, fontSize: 11 }}>
        {labelOf(MAINTENANCE_TYPES, occurrence.maintenance_type)}
        {day ? ` · ${format(day, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}` : ''}
      </p>
    </MCard>
  );
}

/**
 * O histórico de ocorrências do prédio, do mais recente para o mais antigo.
 *
 * Só leitura: nenhum botão de encaminhar, receber ou fechar mora aqui. Quem
 * trata chamado tem a mesa dele — esta lista é para saber o que já foi
 * encontrado no prédio, e é isso que a torna livre para qualquer vínculo.
 */
export function OcorrenciasList({ buildingId }) {
  const { data, isLoading } = useBuildingOccurrences(buildingId);
  const occurrences = data?.tickets ?? [];

  if (!buildingId) {
    return (
      <MCard className="anim-fade-up anim-d1" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p style={{ color: M.mute, fontSize: 14 }}>
          As ocorrências são de um prédio — esta conta não está vinculada a nenhum
        </p>
      </MCard>
    );
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="anim-fade-in" style={{ height: 104, borderRadius: 26 }} />
        ))}
      </div>
    );
  }

  if (occurrences.length === 0) {
    return (
      <MCard className="anim-fade-up anim-d1" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p style={{ color: M.mute, fontSize: 14 }}>Nenhuma ocorrência neste prédio ainda</p>
      </MCard>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {occurrences.map((o, idx) => (
        <OcorrenciaCard
          key={o.id}
          occurrence={o}
          className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
        />
      ))}
    </div>
  );
}
