import { parseReportDate } from '@/app/lib/date';

/**
 * As regras da mesa do responsável no desktop — o que o quadro, o painel e a
 * atividade leem do mesmo jeito.
 *
 * Tudo sai da mesma lista (`/tickets/me` com os finalizados): o responsável
 * trabalha em vários prédios ao mesmo tempo, e a lista dele é a única consulta
 * que já atravessa todos. Os contadores do moderador (`/tickets/stats`) são de
 * um prédio só, e nem são abertos a ele.
 */

/**
 * As colunas do quadro, na ordem em que o chamado anda.
 *
 * São as três filas do telefone (ver `ABAS`, em `responsavel/page.js`) com a
 * última partida em duas: no telefone, "concluído" junta o que ele entregou com
 * o que o moderador já fechou, porque a tela é estreita e as duas coisas são
 * "trabalho que terminei". No quadro há largura para separar o que ainda pode
 * voltar (o moderador pode reenviar) do que acabou de vez.
 */
export const COLUNAS = [
  {
    id: 'RECEBER',
    titulo: 'A receber',
    descricao: 'Encaminhados a você, esperando o aceite',
    status: ['ENCAMINHADO'],
    vazio: 'Nada esperando você receber',
  },
  {
    id: 'ANDAMENTO',
    titulo: 'Em andamento',
    descricao: 'Recebidos por você e ainda em execução',
    status: ['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO'],
    vazio: 'Nenhum chamado em execução com você',
  },
  {
    id: 'MODERADOR',
    titulo: 'Com o moderador',
    descricao: 'Você concluiu; falta o moderador fechar',
    status: ['AGUARDANDO_FECHAMENTO'],
    vazio: 'Nada esperando o moderador',
  },
  {
    id: 'CONCLUIDOS',
    titulo: 'Finalizados',
    descricao: 'Fechados pelo moderador',
    status: ['CONCLUIDO'],
    vazio: 'Nenhum chamado finalizado ainda',
  },
];

export const EXECUTANDO = ['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO'];

/** Os estados que ainda esperam algum gesto — de quem quer que seja. */
export const ABERTOS = ['ENCAMINHADO', 'EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO', 'AGUARDANDO_FECHAMENTO'];

const NIVEL_PRIORIDADE = { ALTA: 3, MEDIA: 2, BAIXA: 1 };

/** O prazo neutro de um chamado que chegou sem ele. */
const SEM_PRAZO = { dias: null, limite: null, consumo: 0, atrasado: false, em_risco: false, congelado: false };

export function prazo(ticket) {
  return ticket?.sla ?? SEM_PRAZO;
}

function diasUteis(n) {
  return n === 1 ? '1 dia útil' : `${n} dias úteis`;
}

/**
 * O prazo em palavras — e o atraso escrito, não só vermelho: quem não distingue
 * a cor precisa ler a mesma notícia.
 */
export function textoDoPrazo(ticket) {
  const { dias, limite, restantes, atrasado, congelado } = prazo(ticket);
  if (dias === null || dias === undefined) return 'Sem prazo';
  if (atrasado) return `Atrasado há ${diasUteis(dias - limite)}`;
  if (congelado) return `Fechado em ${diasUteis(dias)}`;
  if (restantes === 0) return 'Vence hoje';
  return `${diasUteis(restantes)} para o prazo`;
}

/**
 * A ordem do que ainda está aberto: atrasado primeiro, depois a gravidade, e
 * então o quanto do prazo já foi gasto — o mesmo critério da triagem do
 * moderador (ver `porUrgencia`, em `ChamadosBoard`), para os dois lados do
 * chamado concordarem sobre o que é "o mais urgente".
 */
export function porUrgencia(a, b) {
  const pa = prazo(a);
  const pb = prazo(b);
  return (
    Number(pb.atrasado) - Number(pa.atrasado) ||
    (NIVEL_PRIORIDADE[b.priority] ?? 0) - (NIVEL_PRIORIDADE[a.priority] ?? 0) ||
    pb.consumo - pa.consumo
  );
}

/** Quando o chamado deixou de ser trabalho de quem o atendeu. */
export function fimDoTrabalho(ticket) {
  const quando = ticket.closed_at ?? ticket.done_at ?? ticket.created_at;
  return quando ? new Date(quando).getTime() : 0;
}

/** A coluna, já ordenada: o que acabou lê-se pelo fim, o resto pela urgência. */
export function ordenarColuna(id, tickets) {
  if (id === 'MODERADOR' || id === 'CONCLUIDOS') {
    return [...tickets].sort((a, b) => fimDoTrabalho(b) - fimDoTrabalho(a));
  }
  return [...tickets].sort(porUrgencia);
}

/** Precisa de um gesto dele agora: espera aceite, ou está aberto e apertado. */
export function precisaDeAtencao(ticket) {
  if (ticket.status === 'ENCAMINHADO') return true;
  if (!EXECUTANDO.includes(ticket.status)) return false;
  const p = prazo(ticket);
  return p.atrasado || p.em_risco;
}

/** Os prédios que aparecem na lista, na ordem do nome. */
export function prediosDaLista(tickets) {
  const mapa = new Map();
  for (const t of tickets) {
    const b = t.report?.building;
    if (b?.id && !mapa.has(b.id)) mapa.set(b.id, b.name);
  }
  return [...mapa.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * A média, em horas, entre dois carimbos de cada chamado.
 *
 * Só entra quem tem os dois: um chamado que ainda não foi recebido não conta
 * como "recebido em zero horas", e puxaria a média para baixo.
 */
export function mediaEmHoras(tickets, de, ate) {
  const intervalos = tickets
    .filter((t) => t[de] && t[ate])
    .map((t) => (new Date(t[ate]) - new Date(t[de])) / 36e5)
    .filter((h) => h >= 0);
  if (intervalos.length === 0) return null;
  return intervalos.reduce((s, h) => s + h, 0) / intervalos.length;
}

/** "3 h", "2 dias" — o bastante para comparar, sem fingir precisão. */
export function duracaoCurta(horas) {
  if (horas === null || horas === undefined) return '—';
  if (horas < 1) return 'menos de 1 h';
  if (horas < 48) return `${Math.round(horas)} h`;
  const dias = Math.round(horas / 24);
  return `${dias} dias`;
}

/**
 * O que a pessoa fez, e o que aconteceu com o trabalho dela, como eventos.
 *
 * Sai dos carimbos que cada chamado já carrega — encaminhado, recebido,
 * concluído, fechado. Não há uma tabela de atividade no servidor; e não precisa:
 * cada carimbo é gravado no gesto que ele marca, então a lista é o registro do
 * que aconteceu, e não uma reconstrução aproximada.
 *
 * `quem` diz de quem foi o gesto. "Encaminhado" e "fechado" são do moderador, e
 * aparecem porque mudam o trabalho do responsável — mas marcados como tal, para
 * a lista não dizer que foi ele quem fez.
 */
export const TIPOS_DE_EVENTO = {
  ENCAMINHADO: { label: 'Encaminhado a você', quem: 'moderador' },
  RECEBIDO: { label: 'Você recebeu', quem: 'voce' },
  CONCLUIDO: { label: 'Você concluiu', quem: 'voce' },
  FECHADO: { label: 'Moderador finalizou', quem: 'moderador' },
};

export function eventosDaAtividade(tickets) {
  const eventos = [];
  for (const t of tickets) {
    if (t.forwarded_at) eventos.push({ tipo: 'ENCAMINHADO', quando: t.forwarded_at, ticket: t });
    if (t.received_at) eventos.push({ tipo: 'RECEBIDO', quando: t.received_at, ticket: t });
    if (t.done_at) eventos.push({ tipo: 'CONCLUIDO', quando: t.done_at, ticket: t });
    if (t.closed_at) eventos.push({ tipo: 'FECHADO', quando: t.closed_at, ticket: t });
  }
  return eventos
    .map((e) => ({ ...e, id: `${e.ticket.id}-${e.tipo}`, ms: new Date(e.quando).getTime() }))
    .sort((a, b) => b.ms - a.ms);
}

/** O dia da vistoria que abriu o chamado, como `Date` local. */
export function diaRelatado(ticket) {
  return parseReportDate(ticket.report?.date);
}
