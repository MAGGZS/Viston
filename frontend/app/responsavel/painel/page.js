'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, ArrowRight, CheckCheck, Inbox, Plus, Spline, UserCheck } from 'lucide-react';
import { ResponsavelShell } from '@/app/components/ResponsavelShell';
import { ResponsavelChamadoModal } from '@/app/components/ResponsavelChamadoModal';
import { RegistrarOcorrenciaModal } from '@/app/components/RegistrarOcorrenciaModal';
import { Badge, Skeleton, StatCard } from '@/app/components/ui';
import { useMyTickets } from '@/app/hooks/useApi';
import { MAINTENANCE_TYPES, PRIORITIES, labelOf } from '@/app/lib/maintenanceOptions';
import { PRIORITY_VARIANT } from '@/app/lib/chamadoFormat';
import {
  ABERTOS,
  EXECUTANDO,
  duracaoCurta,
  mediaEmHoras,
  porUrgencia,
  prazo,
  precisaDeAtencao,
  prediosDaLista,
  textoDoPrazo,
} from '@/app/lib/chamadosDoResponsavel';
import { useAuthStore } from '@/app/store/auth';
import { T, R, W, NUM, CHART_MARK } from '@/app/lib/theme';

const CARTAO = { background: T.card, borderRadius: R.card, boxShadow: T.cardRing };

/** Quantos meses o gráfico de entregas cobre, contando o atual. */
const MESES = 6;

/** Título de bloco, com a frase que diz o que ele responde. */
function Cabecalho({ titulo, texto, acao }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px 12px' }}>
      <div>
        <h2 style={{ color: T.text, fontSize: 15, fontWeight: W.title, fontFamily: T.display }}>{titulo}</h2>
        {texto && <p style={{ color: T.mute, fontSize: 12, marginTop: 3 }}>{texto}</p>}
      </div>
      {acao}
    </div>
  );
}

/**
 * O que depende dele agora.
 *
 * O que espera aceite e o que está aberto com o prazo apertado — atrasado ou em
 * risco. É a pergunta com que o responsável abre a tela: "o que eu faço
 * primeiro". O resto do trabalho está no quadro, a um clique.
 */
function PrecisaDeVoce({ tickets, isLoading, onAbrir }) {
  const lista = tickets.filter(precisaDeAtencao).sort(porUrgencia);
  const mostrados = lista.slice(0, 6);

  return (
    <section className="anim-fade-up anim-d5" style={{ ...CARTAO, display: 'flex', flexDirection: 'column' }}>
      <Cabecalho
        titulo="Precisa de você"
        texto="O que espera aceite e o que está com o prazo apertado"
        acao={
          <Link href="/responsavel/chamados" style={{ color: T.accentInk, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Abrir o quadro <ArrowRight size={14} />
          </Link>
        }
      />

      <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isLoading && [1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 58, borderRadius: R.control }} />)}

        {!isLoading && lista.length === 0 && (
          <div style={{ padding: '30px 12px', textAlign: 'center' }}>
            <CheckCheck size={28} color={T.faint} style={{ margin: '0 auto 10px' }} aria-hidden="true" />
            <p style={{ color: T.text, fontSize: 14, fontWeight: W.title }}>Nada apertado</p>
            <p style={{ color: T.mute, fontSize: 13, marginTop: 4 }}>
              Nenhum chamado esperando aceite ou perto do prazo.
            </p>
          </div>
        )}

        {mostrados.map((t, idx) => {
          const p = prazo(t);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onAbrir(t)}
              className={`linha-clicavel anim-fade-in anim-d${Math.min(idx + 1, 6)}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                padding: '11px 10px', borderRadius: R.control, border: 'none', background: 'transparent',
                cursor: 'pointer', font: 'inherit', color: 'inherit',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                  background: t.status === 'ENCAMINHADO' ? T.accent : p.atrasado ? T.danger : T.mute,
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: T.text, fontSize: 14, fontWeight: W.title, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.floor?.label ?? 'Andar'} · {labelOf(MAINTENANCE_TYPES, t.maintenance_type)}
                </span>
                <span style={{ display: 'block', color: T.faint, fontSize: 12, marginTop: 2 }}>
                  {t.report?.building?.name} · {t.status === 'ENCAMINHADO' ? 'Espera você receber' : textoDoPrazo(t)}
                </span>
              </span>
              <Badge variant={PRIORITY_VARIANT[t.priority] ?? 'default'}>{labelOf(PRIORITIES, t.priority)}</Badge>
            </button>
          );
        })}

        {lista.length > mostrados.length && (
          <p style={{ color: T.faint, fontSize: 12, padding: '6px 10px' }}>
            E mais {lista.length - mostrados.length} no quadro.
          </p>
        )}
      </div>
    </section>
  );
}

/** Um número de ritmo: o que é, quanto é, e de onde vem. */
function Ritmo({ label, valor, detalhe }) {
  return (
    <div style={{ padding: '12px 0', borderTop: `1px solid ${T.line}` }}>
      <p style={{ color: T.mute, fontSize: 12 }}>{label}</p>
      <p style={{ color: T.text, fontSize: 22, fontWeight: W.title, fontFamily: T.display, marginTop: 4, ...NUM }}>{valor}</p>
      {detalhe && <p style={{ color: T.faint, fontSize: 12, marginTop: 2 }}>{detalhe}</p>}
    </div>
  );
}

/**
 * Como ele anda — as medidas do próprio trabalho.
 *
 * Tempo até receber e tempo de execução são médias só de quem tem os dois
 * carimbos. "No prazo" conta só o que o moderador já fechou: o prazo de um
 * chamado ainda aberto continua correndo, e contá-lo agora seria dar nota a uma
 * prova que não acabou.
 */
function SeuRitmo({ tickets, isLoading }) {
  const aceite = mediaEmHoras(tickets, 'forwarded_at', 'received_at');
  const execucao = mediaEmHoras(tickets, 'received_at', 'done_at');
  const fechados = tickets.filter((t) => t.status === 'CONCLUIDO' && prazo(t).dias !== null);
  const noPrazo = fechados.filter((t) => !prazo(t).atrasado).length;
  const taxa = fechados.length > 0 ? `${Math.round((noPrazo / fechados.length) * 100)}%` : '—';

  return (
    <section className="anim-fade-up anim-d6" style={{ ...CARTAO, padding: '0 20px 8px' }}>
      <div style={{ margin: '0 -20px' }}>
        <Cabecalho titulo="Seu ritmo" texto="Médias de todo o seu histórico" />
      </div>
      {isLoading ? (
        <Skeleton style={{ height: 200, borderRadius: R.control, marginBottom: 12 }} />
      ) : (
        <>
          <Ritmo label="Tempo até receber" valor={duracaoCurta(aceite)} detalhe="Do encaminhamento ao seu aceite" />
          <Ritmo label="Tempo de execução" valor={duracaoCurta(execucao)} detalhe="Do aceite até você concluir" />
          <Ritmo
            label="Finalizados no prazo"
            valor={taxa}
            detalhe={fechados.length > 0 ? `${noPrazo} de ${fechados.length} fechados pelo moderador` : 'Nenhum chamado fechado ainda'}
          />
        </>
      )}
    </section>
  );
}

/**
 * Entregas por mês: quantos chamados ele concluiu em cada um dos últimos meses.
 *
 * Uma série só, então sem legenda — o título diz o que é. As barras usam a
 * tinta neutra dos gráficos do produto e só a que está sob o cursor acende (ver
 * `OcorrenciasPorTipo`); o valor aparece no mês corrente e em quem recebe o
 * cursor, e não em todas, para a leitura ser a forma e não uma fila de números.
 */
function EntregasPorMes({ tickets, isLoading }) {
  const [foco, setFoco] = useState(null);

  const meses = useMemo(() => {
    const inicio = startOfMonth(subMonths(new Date(), MESES - 1));
    const lista = Array.from({ length: MESES }, (_, i) => {
      const d = startOfMonth(subMonths(new Date(), MESES - 1 - i));
      return { chave: format(d, 'yyyy-MM'), label: format(d, 'MMM', { locale: ptBR }), longo: format(d, "MMMM 'de' yyyy", { locale: ptBR }), valor: 0 };
    });
    const porChave = new Map(lista.map((m) => [m.chave, m]));
    for (const t of tickets) {
      if (!t.done_at) continue;
      const d = new Date(t.done_at);
      if (d < inicio) continue;
      const m = porChave.get(format(d, 'yyyy-MM'));
      if (m) m.valor += 1;
    }
    return lista;
  }, [tickets]);

  const maximo = Math.max(1, ...meses.map((m) => m.valor));
  const total = meses.reduce((s, m) => s + m.valor, 0);
  const ALTURA = 150;

  return (
    <section className="anim-fade-up anim-d6" style={{ ...CARTAO, display: 'flex', flexDirection: 'column' }}>
      <Cabecalho titulo="Entregas por mês" texto={`Chamados que você concluiu nos últimos ${MESES} meses · ${total} no total`} />

      {isLoading ? (
        <div style={{ padding: '0 20px 20px' }}><Skeleton style={{ height: ALTURA + 30, borderRadius: R.control }} /></div>
      ) : (
        <div
          role="img"
          aria-label={`Entregas por mês: ${meses.map((m) => `${m.longo}, ${m.valor}`).join('; ')}`}
          style={{ padding: '8px 20px 18px' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: ALTURA, borderBottom: `1px solid ${T.line}` }}>
            {meses.map((m, i) => {
              const ativo = foco === i;
              const mostraValor = ativo || (foco === null && i === meses.length - 1);
              return (
                <div
                  key={m.chave}
                  onMouseEnter={() => setFoco(i)}
                  onMouseLeave={() => setFoco(null)}
                  title={`${m.longo}: ${m.valor} ${m.valor === 1 ? 'entrega' : 'entregas'}`}
                  style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', cursor: 'default' }}
                >
                  <span style={{ color: T.text, fontSize: 12, fontWeight: W.title, marginBottom: 4, opacity: mostraValor ? 1 : 0, transition: 'opacity 120ms', ...NUM }}>
                    {m.valor}
                  </span>
                  <div
                    style={{
                      width: '56%', maxWidth: 44,
                      height: `${(m.valor / maximo) * (ALTURA - 24)}px`,
                      minHeight: m.valor > 0 ? 3 : 0,
                      background: ativo ? T.accent : CHART_MARK,
                      borderRadius: '4px 4px 0 0',
                      transition: 'background 120ms, height 300ms',
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
            {meses.map((m) => (
              <span key={m.chave} style={{ flex: 1, textAlign: 'center', color: T.faint, fontSize: 12, textTransform: 'capitalize' }}>
                {m.label.replace('.', '')}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * O trabalho aberto partido por prédio — só para quem atende mais de um.
 *
 * Com um prédio só, a tabela repetiria os contadores do topo numa linha.
 */
function PorPredio({ tickets }) {
  const predios = prediosDaLista(tickets);
  if (predios.length < 2) return null;

  const linhas = predios.map((b) => {
    const doPredio = tickets.filter((t) => t.report?.building?.id === b.id);
    return {
      ...b,
      receber: doPredio.filter((t) => t.status === 'ENCAMINHADO').length,
      andamento: doPredio.filter((t) => EXECUTANDO.includes(t.status)).length,
      moderador: doPredio.filter((t) => t.status === 'AGUARDANDO_FECHAMENTO').length,
      atrasados: doPredio.filter((t) => ABERTOS.includes(t.status) && prazo(t).atrasado).length,
    };
  });

  const COLS = [
    ['Prédio', null],
    ['A receber', 'receber'],
    ['Em andamento', 'andamento'],
    ['Com o moderador', 'moderador'],
    ['Fora do prazo', 'atrasados'],
  ];

  return (
    <section className="anim-fade-up anim-d6" style={{ ...CARTAO, overflow: 'hidden' }}>
      <Cabecalho titulo="Por prédio" texto="O trabalho aberto em cada prédio que você atende" />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            {COLS.map(([h, k]) => (
              <th key={h} style={{ textAlign: k ? 'right' : 'left', padding: '10px 20px', color: T.mute, fontSize: 12, fontWeight: W.body }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} style={{ borderBottom: `1px solid ${T.line}` }}>
              <td style={{ padding: '11px 20px', color: T.text, fontSize: 14 }}>{l.name}</td>
              {COLS.slice(1).map(([, k]) => (
                <td key={k} style={{ padding: '11px 20px', textAlign: 'right', fontSize: 14, color: k === 'atrasados' && l[k] > 0 ? T.danger : T.text, ...NUM }}>
                  {l[k]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * O painel do responsável no computador.
 *
 * Desce em graus de detalhe, como o do moderador: os contadores são o número que
 * se bate o olho; "Precisa de você" é o que fazer agora; o ritmo e as entregas
 * são como ele vem trabalhando. Tudo sai da lista dele, que atravessa todos os
 * prédios — o painel é da pessoa, não de um prédio.
 */
export default function PainelDoResponsavelPage() {
  const { user } = useAuthStore();
  const { data, isLoading } = useMyTickets(true, true);
  const tickets = useMemo(() => data?.tickets ?? [], [data]);
  const [aberto, setAberto] = useState(null);
  const [registrando, setRegistrando] = useState(false);

  const inicioDoMes = startOfMonth(new Date());
  const contar = (fn) => tickets.filter(fn).length;
  const aReceber = contar((t) => t.status === 'ENCAMINHADO');
  const andamento = contar((t) => EXECUTANDO.includes(t.status));
  const comModerador = contar((t) => t.status === 'AGUARDANDO_FECHAMENTO');
  const finalizadosNoMes = contar((t) => t.status === 'CONCLUIDO' && t.closed_at && new Date(t.closed_at) >= inicioDoMes);
  const atrasados = contar((t) => ABERTOS.includes(t.status) && prazo(t).atrasado);

  const primeiroNome = user?.name?.split(' ')[0] ?? '';

  return (
    <ResponsavelShell
      title={`Olá, ${primeiroNome}`}
      subtitle={format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
      actions={
        <button type="button" onClick={() => setRegistrando(true)} className="flex items-center gap-2 px-4 py-2 bg-chip rounded-control text-mute text-sm hover:text-ink transition-colors flex-shrink-0">
          <Plus size={15} /> Registrar ocorrência
        </button>
      }
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 32px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 16 }}>
          <StatCard className="anim-fade-up anim-d1" icon={Inbox} label="A receber" value={aReceber} loading={isLoading} />
          <StatCard className="anim-fade-up anim-d2" icon={Spline} label="Em andamento" value={andamento} loading={isLoading} />
          <StatCard className="anim-fade-up anim-d3" icon={UserCheck} label="Com o moderador" value={comModerador} loading={isLoading} />
          <StatCard className="anim-fade-up anim-d4" icon={CheckCheck} label="Finalizados no mês" value={finalizadosNoMes} loading={isLoading} />
          <StatCard className="anim-fade-up anim-d5" icon={AlertTriangle} label="Fora do prazo" value={atrasados} loading={isLoading} alerta />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
          <PrecisaDeVoce tickets={tickets} isLoading={isLoading} onAbrir={(t) => setAberto(t)} />
          <SeuRitmo tickets={tickets} isLoading={isLoading} />
        </div>

        <EntregasPorMes tickets={tickets} isLoading={isLoading} />

        <PorPredio tickets={tickets} />
      </div>

      <ResponsavelChamadoModal
        open={!!aberto}
        ticketId={aberto?.id}
        inicial={aberto}
        onClose={() => setAberto(null)}
      />

      <RegistrarOcorrenciaModal open={registrando} onClose={() => setRegistrando(false)} />
    </ResponsavelShell>
  );
}
