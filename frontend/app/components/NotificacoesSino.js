'use client';
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Modal, Skeleton } from '@/app/components/ui';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/app/hooks/useApi';
import { T, W } from '@/app/lib/theme';
import { formatHaQuanto, isScheduleNotification, textoNotificacao } from '@/app/lib/agenda';

function Aviso({ notification, onOpen }) {
  const { title, body } = textoNotificacao(notification);
  const naoLido = !notification.read_at;
  const quando = formatHaQuanto(notification.created_at);

  return (
    <li>
      <button
        type="button"
        className="agenda-linha"
        onClick={() => onOpen(notification)}
        style={{
          width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 10px', minHeight: 56, border: 'none', borderRadius: 12,
          background: 'transparent', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
            // Neutro forte: o dourado é de ação, e o ponto só diz "não lido".
            background: naoLido ? T.text : 'transparent',
          }}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: naoLido ? W.title : W.body, color: T.text, fontFamily: T.display }}>
            {naoLido && <span className="so-leitor">Não lida: </span>}
            {title}
          </span>
          {body && (
            <span style={{ display: 'block', fontSize: 13, color: T.mute, marginTop: 2, lineHeight: 1.45 }}>{body}</span>
          )}
          {quando && <span style={{ display: 'block', fontSize: 12, color: T.faint, marginTop: 4 }}>{quando}</span>}
        </span>
      </button>
    </li>
  );
}

/**
 * O sino de avisos da conta — agendamentos criados, alterados, cancelados e
 * perto do prazo. O atraso não vira aviso: é o alerta fixo da agenda (avisos
 * antigos de atraso que já estão no banco ainda aparecem, com o título deles).
 *
 * Não substitui o `NotificacaoChamados` (que é a caixa de aceite do
 * responsável): este é o sino geral, alimentado por `/me/notifications`, que
 * se atualiza sozinho a cada minuto enquanto a aba está visível.
 *
 * Props:
 * - `onOpenSchedule(payload, notification)`: opcional; chamado ao clicar num
 *   aviso de agendamento (a caixa fecha antes). `payload` traz `schedule_id`,
 *   `building_name`, `scheduled_date`, `due_date`, `floors`. Sem ele, o clique
 *   só marca como lido.
 * - `limit`: quantos avisos buscar (padrão 20).
 * - `buildingId`: só os avisos deste prédio — o que a tela tem escolhido.
 * - `enabled`: liga/desliga a busca (padrão `true`) — para telas onde a conta
 *   ainda não carregou.
 *
 * O clique marca como lido na hora (otimista); "Marcar todas como lidas"
 * aparece só quando há o que marcar.
 */
export function NotificacoesSino({ onOpenSchedule, limit = 20, enabled = true, buildingId }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useNotifications({ limit, enabled, buildingId });
  const marcar = useMarkNotificationRead();
  const marcarTodas = useMarkAllNotificationsRead(buildingId);

  const lista = data?.notifications ?? [];
  const unread = data?.unread ?? lista.filter((n) => !n.read_at).length;
  const contador = unread > 99 ? '99+' : String(unread);

  function abrirAviso(n) {
    if (!n.read_at) marcar.mutate(n.id);
    if (onOpenSchedule && isScheduleNotification(n)) {
      setOpen(false);
      onOpenSchedule(n.payload ?? {}, n);
    }
  }

  return (
    <>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          className="icone-btn icone-btn--chip"
          aria-label={unread > 0 ? `Notificações, ${unread} não lida${unread !== 1 ? 's' : ''}` : 'Notificações'}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <Bell size={18} aria-hidden="true" />
        </button>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="anim-pop-in"
            style={{
              position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20,
              padding: '0 5px', borderRadius: 999, background: T.accent, color: T.onAccent,
              fontFamily: T.display, fontSize: 12, fontWeight: W.title,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${T.bg}`, pointerEvents: 'none',
            }}
          >
            {contador}
          </span>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Notificações" maxWidth={440}>
        {unread > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
            <button
              type="button"
              className="link-acao link-acao--acento"
              onClick={() => marcarTodas.mutate()}
              disabled={marcarTodas.isPending}
              style={{ color: T.accentInk, fontSize: 13, fontWeight: W.strong, minHeight: 44, padding: '0 4px' }}
            >
              Marcar todas como lidas
            </button>
          </div>
        )}

        {isLoading ? (
          <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} style={{ height: 52 }} />
            ))}
          </div>
        ) : isError ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <p role="alert" style={{ color: T.mute, fontSize: 14 }}>Não foi possível carregar as notificações.</p>
            <button type="button" className="link-acao link-acao--acento" onClick={() => refetch()} style={{ color: T.accentInk, fontSize: 13, minHeight: 44 }}>
              Tentar de novo
            </button>
          </div>
        ) : lista.length === 0 ? (
          <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.6, padding: '8px 0 4px' }}>
            Nenhuma notificação por enquanto. Quando uma vistoria for agendada,
            alterada ou estiver perto do prazo, o aviso aparece aqui.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 -10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {lista.map((n) => (
              <Aviso key={n.id} notification={n} onOpen={abrirAviso} />
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
