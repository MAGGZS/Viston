'use client';
import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, CheckCheck, Heart, Inbox, ListTodo, MessageSquare, RefreshCw, Trash2 } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Avatar } from '@/app/components/Avatar';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Button, Badge, Modal, Skeleton } from '@/app/components/ui';
import { useFeedbacks, useReviewFeedback, useDiscardFeedback } from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';
import { CONTENT_ID } from '@/app/components/mobile/kit';

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
    empty: 'Sua lista está vazia. O que você receber dos pendentes vira item aqui.',
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
        <p className="text-ink text-sm truncate">{author.name}</p>
        <p className="text-faint text-xs truncate">{author.email}</p>
      </div>
    </div>
  );
}

/**
 * Um feedback e o que dá para fazer com ele.
 *
 * O texto do pendente aparece inteiro: é o que se lê para decidir, e cortar em
 * três linhas obrigaria a abrir cada um. Mensagem é a exceção: ali o cartão é
 * uma capa, e o texto inteiro mora na caixa de leitura. Tarefa não passa por
 * aqui — vira item de lista, no `TaskRow`.
 */
function FeedbackCard({ feedback, status, index, onOpen, onReview, onDiscard, busy }) {
  const clickable = status === 'MENSAGEM';

  return (
    // O cartão não é o alvo: ele já tem botões dentro (receber, descartar), e
    // botão dentro de botão o teclado não alcança. Quem abre a leitura completa
    // é o próprio texto, logo abaixo, que vira botão quando há o que abrir.
    <article className={`anim-fade-up anim-d${Math.min(index + 1, 6)} bg-card rounded-card p-5`}>
      <div className="flex items-start justify-between gap-4">
        <Author author={feedback.author} />
        <div className="flex items-center gap-2 flex-shrink-0">
          {feedback.author?.kind === 'MANAGER' && <Badge variant="accent">Gestor</Badge>}
          <span className="text-faint text-xs whitespace-nowrap">
            {format(new Date(feedback.created_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
          </span>
        </div>
      </div>

      {clickable ? (
        <button
          type="button"
          onClick={onOpen}
          className="text-sm mt-4 block w-full text-left cursor-pointer"
          style={{
            color: T.text, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'none',
            border: 'none', padding: 0, font: 'inherit',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {feedback.message}
        </button>
      ) : (
        <p className="text-sm mt-4" style={{ color: T.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {feedback.message}
        </p>
      )}

      <div className="flex gap-2 mt-5">
        {status === 'PENDENTE' && (
          <>
            <Button onClick={() => onReview('TAREFA')} disabled={busy}>
              <CheckCheck size={16} /> Receber
            </Button>
            <Button
              variant="secondary"
              onClick={() => onReview('MENSAGEM')}
              disabled={busy}
              aria-label="É um elogio"
            >
              <Heart size={15} />
            </Button>
            <Button variant="danger" className="ml-auto" onClick={onDiscard} disabled={busy}>
              <Trash2 size={15} /> Descartar
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

/** Quanto tempo o item marcado espera antes de sair da lista de vez. */
const UNDO_MS = 5000;

/**
 * Uma tarefa, como linha de lista de checagem.
 *
 * O que o admin recebeu é uma lista de coisas a fazer, e lista de coisas a
 * fazer se lê de cima a baixo: caixa, texto, e o resto miúdo embaixo. Por isso
 * a autoria e a data descem para uma linha de apoio — quem abre esta aba quer
 * saber o que falta fazer, não quem pediu.
 *
 * Marcar conclui, e concluir apaga a linha (ver o serviço). Como não há volta
 * depois de apagar, a marca fica visível por alguns segundos com o "Desfazer"
 * ao lado antes de a exclusão sair — tempo de perceber o clique errado, sem
 * uma caixa de confirmação a cada item.
 */
function TaskRow({ feedback, index, checked, onToggle, onMove, busy }) {
  return (
    <article
      className={`anim-fade-up anim-d${Math.min(index + 1, 6)} bg-card rounded-card`}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
        opacity: checked ? 0.55 : 1, transition: 'opacity 0.2s ease',
      }}
    >
      <button
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={checked ? 'Reabrir a tarefa' : 'Concluir a tarefa'}
        className="transition-colors duration-150"
        style={{
          width: 22, height: 22, marginTop: 1, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 7, cursor: 'pointer',
          border: checked ? '1.5px solid transparent' : `1.5px solid ${T.faint}`,
          background: checked ? T.accent : 'transparent',
        }}
        onMouseEnter={(e) => { if (!checked) e.currentTarget.style.borderColor = T.accent; }}
        onMouseLeave={(e) => { if (!checked) e.currentTarget.style.borderColor = T.faint; }}
      >
        {checked && <Check size={13} strokeWidth={3} color={T.onAccent} />}
      </button>

      <div className="min-w-0 flex-1">
        <p style={{
          color: checked ? T.mute : T.text, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap',
          textDecoration: checked ? 'line-through' : 'none',
        }}>
          {feedback.message}
        </p>

        <div className="flex items-center gap-2 mt-2">
          <span className="text-faint text-xs truncate">{feedback.author?.name ?? 'Conta removida'}</span>
          {feedback.author?.kind === 'MANAGER' && <Badge variant="accent">Gestor</Badge>}
          <span className="text-faint text-xs whitespace-nowrap">
            {format(new Date(feedback.created_at), "d 'de' MMM", { locale: ptBR })}
          </span>
        </div>
      </div>

      {checked ? (
        <Button variant="ghost" onClick={onToggle} style={{ padding: '7px 12px', fontSize: 14 }}>
          Desfazer
        </Button>
      ) : (
        <Button
          variant="ghost"
          onClick={onMove}
          disabled={busy}
          aria-label="Mover para mensagens"
          style={{ padding: 9 }}
        >
          <MessageSquare size={15} />
        </Button>
      )}
    </article>
  );
}

export default function AdminFeedbacksPage() {
  const [tab, setTab] = useState('PENDENTE');
  const [reading, setReading] = useState(null);
  const [discardTarget, setDiscardTarget] = useState(null);
  const [checked, setChecked] = useState([]);
  const undoTimers = useRef(new Map());

  const { data, isLoading, refetch, isFetching } = useFeedbacks(tab);
  const reviewFeedback = useReviewFeedback();
  const discardFeedback = useDiscardFeedback();
  const { show: toast } = useToastStore();

  const feedbacks = data?.feedbacks ?? [];
  const current = TABS.find((t) => t.status === tab);
  const busy = reviewFeedback.isPending || discardFeedback.isPending;

  /* Sair da tela antes de a janela fechar deixa a tarefa na lista: entre perder
     um clique e perder o que alguém escreveu, o clique é o barato. */
  useEffect(() => {
    const pending = undoTimers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  /* O id concluído fica em `checked` de propósito: a linha só some quando a
     lista recarrega, e desmarcá-la antes disso a mostraria inteira de novo por
     um instante. Como o id é de linha apagada, ele não volta a casar com nada.
     Se a exclusão falhar, aí sim a marca sai — a tarefa continua lá. */
  async function concludeTask(id) {
    undoTimers.current.delete(id);
    try {
      await discardFeedback.mutateAsync(id);
      toast('Tarefa concluída', 'success');
    } catch (e) {
      setChecked((ids) => ids.filter((x) => x !== id));
      toast(e?.response?.data?.error?.message || 'Erro ao concluir a tarefa', 'error');
    }
  }

  /** Marca ou desmarca — desmarcar dentro da janela cancela a exclusão. */
  function toggleTask(id) {
    const timer = undoTimers.current.get(id);

    if (timer) {
      clearTimeout(timer);
      undoTimers.current.delete(id);
      setChecked((ids) => ids.filter((x) => x !== id));
      return;
    }

    setChecked((ids) => [...ids, id]);
    undoTimers.current.set(id, setTimeout(() => concludeTask(id), UNDO_MS));
  }

  async function handleReview(id, status) {
    try {
      await reviewFeedback.mutateAsync({ id, status });
      toast(status === 'TAREFA' ? 'Feedback recebido — está na sua lista' : 'Movido para mensagens', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao mover o feedback', 'error');
    }
  }

  async function handleDiscard() {
    try {
      await discardFeedback.mutateAsync(discardTarget.id);
      setDiscardTarget(null);
      setReading(null);
      toast('Feedback excluído', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao excluir', 'error');
    }
  }

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-page">
        <AdminSidebar />
        <main id={CONTENT_ID} className="flex-1 p-8 overflow-auto">
          <div className="anim-fade-down flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-ink">Feedbacks</h1>
              <p className="text-mute text-sm mt-0.5">
                O que o público manda dizer. Você recebe (vira item da sua lista), guarda como mensagem ou descarta.
              </p>
            </div>
            <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
              <RefreshCw size={15} /> Atualizar
            </Button>
          </div>

          {/* As três caixas. A contagem só acompanha a pendente porque é o que
              chega sem ninguém ter olhado — a lista de tarefas e as mensagens
              são de quem já decidiu abrir a aba. */}
          <div className="anim-fade-up anim-d1 flex gap-2 mb-6">
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
                    fontFamily: T.display, fontSize: 14, fontWeight: active ? W.strong : W.body,
                    background: active ? T.accent : T.card,
                    color: active ? T.onAccent : T.mute,
                  }}
                >
                  <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                  {label}
                  {status === 'PENDENTE' && data?.pending > 0 && (
                    <span style={{
                      minWidth: 18, padding: '0 5px', borderRadius: R.badge, fontSize: 12,
                      background: active ? 'rgba(0,0,0,0.18)' : T.accentSoft,
                      color: active ? T.onAccent : T.accentInk,
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

            {/* Tarefa é lista de checagem; pendente e mensagem continuam
                cartões, que é o formato de quem ainda vai ler para decidir. */}
            {feedbacks.map((feedback, idx) => (tab === 'TAREFA' ? (
              <TaskRow
                key={feedback.id}
                feedback={feedback}
                index={idx}
                busy={busy}
                checked={checked.includes(feedback.id)}
                onToggle={() => toggleTask(feedback.id)}
                onMove={() => handleReview(feedback.id, 'MENSAGEM')}
              />
            ) : (
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
            )))}
          </div>
        </main>
      </div>

      {/* O painel é de tela larga, como o resto da área do admin */}
      <div className="lg:hidden flex items-center justify-center min-h-screen bg-page p-6 text-center">
        <div>
          <p className="text-4xl mb-4">🖥️</p>
          <p className="text-ink font-semibold text-lg">Feedbacks</p>
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

      {/* Descartar e excluir são a mesma coisa por baixo: a linha sai do banco.
          Concluir uma tarefa também apaga, mas não passa por aqui — lá quem
          segura o clique errado é a janela de desfazer da própria lista. */}
      <Modal open={!!discardTarget} onClose={() => setDiscardTarget(null)} title="Excluir feedback">
        <div className="flex flex-col gap-4">
          <p className="text-mute text-sm">
            O feedback será apagado definitivamente. Para guardá-lo, receba como tarefa ou mova para mensagens antes.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDiscardTarget(null)}>Cancelar</Button>
            <Button variant="danger" className="flex-1" loading={discardFeedback.isPending} onClick={handleDiscard}>
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </RouteGuard>
  );
}
