'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCheck, Heart, Inbox, ListTodo, MessageSquare, RefreshCw, Trash2 } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Avatar } from '@/app/components/Avatar';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Button, Badge, Modal, Skeleton } from '@/app/components/ui';
import { useFeedbacks, useReviewFeedback, useDiscardFeedback } from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

/**
 * As três caixas do admin, na ordem em que o feedback anda.
 *
 * Uma tela só, e não três: o que muda entre elas é o estado da mesma linha, e
 * separar em páginas obrigaria a navegar para descobrir onde a coisa foi parar.
 *
 * `empty` fala do que aquela caixa guarda — "nada aqui" três vezes não ensina
 * nada a quem abriu a aba pela primeira vez.
 */
const TABS = [
  {
    status: 'PENDENTE',
    label: 'Recebidos',
    icon: Inbox,
    empty: 'Nenhum feedback esperando. Quando alguém mandar, aparece aqui.',
  },
  {
    status: 'TAREFA',
    label: 'Tarefas',
    icon: ListTodo,
    empty: 'Nada na lista. O que você receber dos pendentes vem para cá.',
  },
  {
    status: 'MENSAGEM',
    label: 'Mensagens',
    icon: MessageSquare,
    empty: 'Nenhuma mensagem guardada. Elogios e recados ficam aqui.',
  },
];

/** Quem mandou — ou o vazio que sobra quando a conta saiu do sistema. */
function Author({ author }) {
  if (!author) {
    return (
      <div className="flex items-center gap-3">
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: T.chip }} />
        <div>
          <p className="text-mute text-sm">Conta removida</p>
          <p className="text-faint text-xs">O feedback continua valendo</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar user={author} size={32} />
      <div className="min-w-0">
        <p className="text-white text-sm truncate">{author.name}</p>
        <p className="text-faint text-xs truncate">{author.email}</p>
      </div>
    </div>
  );
}

/**
 * Um feedback e o que dá para fazer com ele.
 *
 * O texto aparece inteiro nas duas primeiras caixas: pendente é o que se lê
 * para decidir, e tarefa é o que se lê para fazer — cortar em três linhas
 * obrigaria a abrir cada um. Mensagem é a exceção: ali o cartão é uma capa, e o
 * texto inteiro mora na caixa de leitura.
 */
function FeedbackCard({ feedback, status, index, onOpen, onReview, onDiscard, busy }) {
  const clickable = status === 'MENSAGEM';

  return (
    <article
      className={`anim-fade-up anim-d${Math.min(index + 1, 6)} bg-card rounded-card p-5`}
      style={clickable ? { cursor: 'pointer' } : undefined}
      onClick={clickable ? onOpen : undefined}
    >
      <div className="flex items-start justify-between gap-4">
        <Author author={feedback.author} />
        <div className="flex items-center gap-2 flex-shrink-0">
          {feedback.author?.kind === 'MANAGER' && <Badge variant="accent">Gestor</Badge>}
          <span className="text-faint text-xs whitespace-nowrap">
            {format(new Date(feedback.created_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
          </span>
        </div>
      </div>

      <p
        className="text-sm mt-4"
        style={{
          color: T.text, lineHeight: 1.6, whiteSpace: 'pre-wrap',
          ...(clickable
            ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
            : {}),
        }}
      >
        {feedback.message}
      </p>

      <div className="flex gap-2 mt-5" onClick={(e) => e.stopPropagation()}>
        {status === 'PENDENTE' && (
          <>
            <Button onClick={() => onReview('TAREFA')} disabled={busy}>
              <CheckCheck size={16} /> Receber
            </Button>
            <Button
              variant="secondary"
              onClick={() => onReview('MENSAGEM')}
              disabled={busy}
              title="É um elogio"
              aria-label="É um elogio"
            >
              <Heart size={15} />
            </Button>
            <Button variant="danger" className="ml-auto" onClick={onDiscard} disabled={busy}>
              <Trash2 size={15} /> Descartar
            </Button>
          </>
        )}

        {status === 'TAREFA' && (
          <>
            <Button variant="secondary" onClick={() => onReview('MENSAGEM')} disabled={busy}>
              <MessageSquare size={15} /> Mover para mensagens
            </Button>
            <Button variant="danger" className="ml-auto" onClick={onDiscard} disabled={busy}>
              <CheckCheck size={15} /> Concluir
            </Button>
          </>
        )}

        {status === 'MENSAGEM' && (
          <>
            <Button variant="secondary" onClick={onOpen}>Ler</Button>
            <Button variant="danger" className="ml-auto" onClick={onDiscard} disabled={busy}>
              <Trash2 size={15} /> Excluir
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

export default function AdminFeedbacksPage() {
  const [tab, setTab] = useState('PENDENTE');
  const [reading, setReading] = useState(null);
  const [discardTarget, setDiscardTarget] = useState(null);

  const { data, isLoading, refetch, isFetching } = useFeedbacks(tab);
  const reviewFeedback = useReviewFeedback();
  const discardFeedback = useDiscardFeedback();
  const { show: toast } = useToastStore();

  const feedbacks = data?.feedbacks ?? [];
  const current = TABS.find((t) => t.status === tab);
  const busy = reviewFeedback.isPending || discardFeedback.isPending;

  async function handleReview(id, status) {
    try {
      await reviewFeedback.mutateAsync({ id, status });
      toast(status === 'TAREFA' ? 'Feedback recebido — está em tarefas' : 'Movido para mensagens', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao mover o feedback', 'error');
    }
  }

  async function handleDiscard() {
    try {
      await discardFeedback.mutateAsync(discardTarget.id);
      setDiscardTarget(null);
      setReading(null);
      toast(tab === 'TAREFA' ? 'Tarefa concluída' : 'Feedback excluído', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao excluir', 'error');
    }
  }

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-page">
        <AdminSidebar />
        <main className="flex-1 p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-white">Feedbacks</h1>
              <p className="text-mute text-sm mt-0.5">
                O que o público manda dizer. Você recebe (vira tarefa), guarda como mensagem ou descarta.
              </p>
            </div>
            <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
              <RefreshCw size={15} /> Atualizar
            </Button>
          </div>

          {/* As três caixas. A contagem só acompanha a pendente porque é a
              única que exige ação — as outras duas são arquivo. */}
          <div className="flex gap-2 mb-6">
            {TABS.map(({ status, label, icon: Icon }) => {
              const active = status === tab;
              return (
                <button
                  key={status}
                  onClick={() => setTab(status)}
                  className="transition-colors duration-150"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 16px', borderRadius: R.control, border: 'none', cursor: 'pointer',
                    fontFamily: T.display, fontSize: 13, fontWeight: active ? W.strong : W.body,
                    background: active ? T.accent : T.card,
                    color: active ? T.onAccent : T.mute,
                  }}
                >
                  <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                  {label}
                  {status === 'PENDENTE' && data?.pending > 0 && (
                    <span style={{
                      minWidth: 18, padding: '0 5px', borderRadius: R.badge, fontSize: 11,
                      background: active ? 'rgba(0,0,0,0.18)' : T.accentSoft,
                      color: active ? T.onAccent : T.accent,
                    }}>
                      {data.pending}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 max-w-3xl">
            {isLoading && [1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-card p-5">
                <Skeleton style={{ height: 32, width: 200 }} />
                <Skeleton className="mt-4" style={{ height: 14, width: '100%' }} />
              </div>
            ))}

            {!isLoading && feedbacks.length === 0 && (
              <div className="bg-card rounded-card px-6 py-14 text-center">
                <current.icon size={26} color={T.faint} style={{ margin: '0 auto 12px' }} />
                <p className="text-mute text-sm">{current.empty}</p>
              </div>
            )}

            {feedbacks.map((feedback, idx) => (
              <FeedbackCard
                key={feedback.id}
                feedback={feedback}
                status={tab}
                index={idx}
                busy={busy}
                onOpen={() => setReading(feedback)}
                onReview={(status) => handleReview(feedback.id, status)}
                onDiscard={() => setDiscardTarget(feedback)}
              />
            ))}
          </div>
        </main>
      </div>

      {/* O painel é de tela larga, como o resto da área do admin */}
      <div className="lg:hidden flex items-center justify-center min-h-screen bg-page p-6 text-center">
        <div>
          <p className="text-4xl mb-4">🖥️</p>
          <p className="text-white font-semibold text-lg">Feedbacks</p>
          <p className="text-mute text-sm mt-2">Acesse pelo computador para ler o que chegou</p>
        </div>
      </div>

      {/* Leitura da mensagem: o texto inteiro, sem o cartão em volta. O
          conteúdo é condicional, e o Modal o segura enquanto a caixa sai. */}
      <Modal open={!!reading} onClose={() => setReading(null)} title="Mensagem" maxWidth={520}>
        {reading && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <Author author={reading.author} />
              <span className="text-faint text-xs whitespace-nowrap">
                {format(new Date(reading.created_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>

            <p style={{ color: T.text, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {reading.message}
            </p>

            <div className="flex gap-3 mt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setReading(null)}>Fechar</Button>
              <Button variant="danger" className="flex-1" onClick={() => setDiscardTarget(reading)}>
                <Trash2 size={15} /> Excluir
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Descartar, concluir e excluir são a mesma coisa por baixo: a linha sai
          do banco. Por isso a confirmação é uma só, com o texto da aba. */}
      <Modal open={!!discardTarget} onClose={() => setDiscardTarget(null)} title={tab === 'TAREFA' ? 'Concluir tarefa' : 'Excluir feedback'}>
        <div className="flex flex-col gap-4">
          <p className="text-mute text-sm">
            {tab === 'TAREFA'
              ? 'A tarefa sai da lista e não volta. Se ainda houver algo a fazer, deixe-a onde está.'
              : 'O feedback será apagado definitivamente. Para guardá-lo, receba como tarefa ou mova para mensagens antes.'}
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDiscardTarget(null)}>Cancelar</Button>
            <Button variant="danger" className="flex-1" loading={discardFeedback.isPending} onClick={handleDiscard}>
              {tab === 'TAREFA' ? 'Concluir' : 'Excluir'}
            </Button>
          </div>
        </div>
      </Modal>
    </RouteGuard>
  );
}
