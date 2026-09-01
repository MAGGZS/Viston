'use client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge, Modal } from '@/app/components/ui';
import { LinhaDoTempo, temLinhaDoTempo } from '@/app/components/LinhaDoTempo';
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
import { T, R, W } from '@/app/lib/theme';

const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

/** O dia da vistoria que abriu a ocorrência, por extenso. */
export function dayLabel(value) {
  const date = parseReportDate(value);
  return date ? format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '—';
}

/** O mesmo dia curto das tabelas. */
export function shortDay(value) {
  const date = parseReportDate(value);
  return date ? format(date, 'dd/MM/yyyy', { locale: ptBR }) : '—';
}

/** Dia de um carimbo do chamado (encaminhado, recebido, concluído, fechado). */
export function stampLabel(value) {
  return value ? format(new Date(value), 'dd/MM/yyyy', { locale: ptBR }) : '—';
}

/** Um par rótulo/valor. */
function Fact({ label, children }) {
  return (
    <div>
      <p style={{ color: T.mute, fontSize: 12 }}>{label}</p>
      <div style={{ color: T.text, fontSize: 14, marginTop: 3, fontWeight: W.strong }}>{children}</div>
    </div>
  );
}

/** Um bloco de texto escrito por alguém sobre o chamado. */
function NoteBlock({ label, children }) {
  return (
    <div style={{ background: T.chip, borderRadius: R.control, padding: '12px 14px' }}>
      <p style={{ color: T.mute, fontSize: 12, marginBottom: 5 }}>{label}</p>
      <p style={{ color: T.text, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{children}</p>
    </div>
  );
}

/**
 * A ocorrência inteira, numa caixa só.
 *
 * É onde mora a descrição: na lista ela virava parede de texto, e quem percorre
 * quer achar a ocorrência — quem achou é que quer lê-la toda, com o caminho que
 * ela fez, quem a concluiu, quem a fechou e quanto custou.
 *
 * Só leitura, em qualquer tela que a abra: nenhuma ação do chamado aparece aqui.
 * Encaminhar, receber e fechar têm cada um o seu lugar, e é lá que a permissão
 * de quem clica é conferida.
 */
export function OcorrenciaModal({ occurrence, open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Ocorrência" maxWidth={560}>
      {occurrence && (
        // O `<dialog>` é `overflow: visible`, então conteúdo alto sairia da tela
        // em vez de rolar — e uma ocorrência com descrição longa, relato do
        // responsável e a linha do tempo inteira passa fácil da altura da
        // janela.
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 18,
          maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
        }}>
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
            <p style={{ color: T.mute, fontSize: 12, marginBottom: 6 }}>O que está acontecendo</p>
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
            {/* Concluído e fechado saíram desta grade: eles são o fim da
                história, e a linha do tempo lá embaixo é onde a história
                acontece. Aqui fica de onde a ocorrência veio e de quem ela é. */}
            <Fact label="Gasto">{formatCost(occurrence.maintenance_cost)}</Fact>
          </div>

          {/* A anotação do moderador não é o fechamento: ela pode ter sido
              escrita com o chamado ainda correndo, e por isso continua sendo um
              bloco à parte, e não um passo da linha. */}
          {occurrence.maintenance_note && (
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
              <NoteBlock label="Manutenção — anotação do moderador">{occurrence.maintenance_note}</NoteBlock>
            </div>
          )}

          {/* O passo a passo de quem executou. Só leitura, como o resto desta
              caixa: quem chega pelo histórico está lendo o que aconteceu no
              prédio, não trabalhando o chamado. */}
          {temLinhaDoTempo(occurrence.status) && (
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
              <LinhaDoTempo ticket={occurrence} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
