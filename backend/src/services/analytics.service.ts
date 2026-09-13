import {
  analyticsRepository,
  AnalyticsScope,
  PeriodRange,
  PrioridadeRow,
} from '../repositories/analytics.repository';
import { buildingRepository } from '../repositories/building.repository';
import { NotFoundError } from '../utils/errors';
import { SLA_BUSINESS_DAYS } from '../utils/sla';
import { zonedParts, zonedTimeToUtc } from '../utils/timezone';
import { AnalyticsFilters } from '../validators/analytics.validator';

/**
 * O painel analítico do prédio.
 *
 * O serviço faz três coisas que o SQL não deve fazer: resolve o período,
 * confere que o responsável pedido é mesmo daquele prédio, e dá nome às contas.
 * Tudo o que é soma fica no repositório.
 */

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** As quatro etapas do fluxo, na ordem em que um chamado as atravessa. */
const ETAPAS = [
  { de: 'ABERTURA', para: 'ENCAMINHADO', rotulo: 'Abertura até encaminhamento' },
  { de: 'ENCAMINHADO', para: 'RECEBIDO', rotulo: 'Encaminhamento até recebimento' },
  { de: 'RECEBIDO', para: 'CONCLUSAO_INFORMADA', rotulo: 'Recebimento até conclusão informada' },
  { de: 'CONCLUSAO_INFORMADA', para: 'FECHADO', rotulo: 'Conclusão informada até fechamento' },
] as const;

/** Dois dígitos, para montar o dia do calendário sem passar por `Date`. */
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * O período escolhido, nos dois eixos em que o painel o lê.
 *
 * O mês é fechado pelo relógio local: `zonedTimeToUtc` devolve o instante da
 * meia-noite de São Paulo, e o fim é o milissegundo anterior ao início do
 * período seguinte. É o que impede o chamado fechado às 21h do dia 31 de contar
 * no mês seguinte.
 *
 * Já os dias, que servem à coluna `date` da vistoria, são montados à mão a
 * partir dos números — passar por `Date` e `toISOString()` é exatamente como se
 * perde um dia.
 */
export function resolvePeriod(year: number, month?: number): PeriodRange & { label: string } {
  const monthIndex = month ? month - 1 : 0;
  const monthCount = month ? 1 : 12;

  const inicio = zonedTimeToUtc(year, monthIndex, 1);
  const fim = new Date(zonedTimeToUtc(year, monthIndex + monthCount, 1).getTime() - 1);

  const ultimoDia = new Date(Date.UTC(year, monthIndex + monthCount, 0)).getUTCDate();
  const ultimoMes = monthIndex + monthCount - 1;

  return {
    from_day: `${year}-${pad(monthIndex + 1)}-01`,
    to_day: `${year + Math.floor(ultimoMes / 12)}-${pad((ultimoMes % 12) + 1)}-${pad(ultimoDia)}`,
    from_instant: inicio,
    to_instant: fim,
    label: month ? `${MESES[monthIndex]} de ${year}` : String(year),
  };
}

/** O período imediatamente anterior, do mesmo tamanho — o termo da comparação. */
export function previousPeriod(year: number, month?: number) {
  if (!month) return resolvePeriod(year - 1);
  return month === 1 ? resolvePeriod(year - 1, 12) : resolvePeriod(year, month - 1);
}

/** Quanto variou, em pontos percentuais do valor anterior. */
function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return ((atual - anterior) / anterior) * 100;
}

/** Percentual, com o zero de denominador tratado como ausência de resposta. */
function percentual(parte: number, total: number): number | null {
  return total === 0 ? null : (parte / total) * 100;
}

/**
 * As três prioridades, sempre as três.
 *
 * O `GROUP BY` só devolve linha para o que existe, e uma quebra que omite a
 * prioridade sem ocorrência obriga a tela a saber a lista inteira para desenhar
 * a linha que falta. Mesma escolha do `ZERO_STATUS` da listagem de chamados.
 */
function porPrioridade(rows: PrioridadeRow[]) {
  return (Object.keys(SLA_BUSINESS_DAYS) as Array<keyof typeof SLA_BUSINESS_DAYS>).map(
    (priority) => {
      const row = rows.find((r) => r.priority === priority);
      const media = row?.media_dias_uteis ?? null;

      return {
        priority,
        meta: SLA_BUSINESS_DAYS[priority],
        nascidos: row?.nascidos ?? 0,
        nascidos_atrasados: row?.nascidos_atrasados ?? 0,
        fechados: row?.fechados ?? 0,
        fechados_atrasados: row?.fechados_atrasados ?? 0,
        media_dias_uteis: media,
        /** Dias acima (positivo) ou abaixo (negativo) da meta da prioridade. */
        acima_da_meta: media === null ? null : media - SLA_BUSINESS_DAYS[priority],
      };
    }
  );
}

/**
 * O responsável pedido, conferido contra o vínculo do prédio.
 *
 * A conferência é o que impede que trocar um id na barra de endereços leia os
 * chamados de alguém de outro prédio: o filtro só entra no SQL depois de o
 * vínculo existir. Sem vínculo é 404, e não uma lista vazia — lista vazia
 * confirmaria que o id existe.
 */
async function scopeDe(buildingId: string, filters: AnalyticsFilters): Promise<AnalyticsScope> {
  if (filters.responsible_id) {
    const vinculado = await buildingRepository.findResponsible(buildingId, filters.responsible_id);
    if (!vinculado) throw new NotFoundError('Responsável');
  }

  return {
    building_id: buildingId,
    responsible_id: filters.responsible_id,
    floor_id: filters.floor_id,
    category: filters.category,
  };
}

/**
 * Quantos dias úteis sem nenhum toque já contam como chamado esquecido.
 *
 * Cinco é uma semana de trabalho: abaixo disso, "parado" ainda é o normal de
 * quem tem outras coisas na fila; acima, ninguém voltou nele de propósito.
 */
const DIAS_SEM_MOVIMENTO = 5;

export const analyticsService = {
  /**
   * A visão geral: os indicadores do topo, o funil e o estado do prazo.
   *
   * Três consultas, e não uma por bloco: os números de cima e os do funil saem
   * do mesmo varrimento porque são leituras do mesmo conjunto, e separá-los
   * abriria a chance de a tela mostrar um total que não fecha com as etapas.
   */
  async overview(buildingId: string, filters: AnalyticsFilters) {
    const agora = zonedParts();
    const year = filters.year ?? agora.year;
    const { month } = filters;

    const atual = resolvePeriod(year, month);
    const anterior = previousPeriod(year, month);
    const scope = await scopeDe(buildingId, filters);

    const [linha, prioridades, emRisco, processo, meses] = await Promise.all([
      analyticsRepository.overview(scope, atual, anterior),
      analyticsRepository.porPrioridade(scope, atual),
      analyticsRepository.emRisco(scope),
      analyticsRepository.saudeDoProcesso(scope, atual, anterior, DIAS_SEM_MOVIMENTO),
      analyticsRepository.evolucaoMensal(scope, year),
    ]);

    const dentro = linha.fechados_no_prazo;
    const pctSla = percentual(dentro, linha.fechados);
    const pctSlaAnterior = percentual(linha.fechados_no_prazo_anterior, linha.fechados_anterior);

    const etapas = ETAPAS.map((etapa, i) => ({
      ...etapa,
      media_horas: linha[`etapa${i + 1}_media` as keyof typeof linha] as number | null,
      mediana_horas: linha[`etapa${i + 1}_mediana` as keyof typeof linha] as number | null,
      parados_agora: linha[`parados${i + 1}` as keyof typeof linha] as number,
    }));

    // O gargalo é a etapa mais lenta do período — e não existe quando nenhuma
    // etapa tem tempo medido, que é o caso do período sem dados.
    const gargalo = etapas
      .filter((e) => e.media_horas !== null)
      .sort((a, b) => (b.media_horas ?? 0) - (a.media_horas ?? 0))[0];

    return {
      periodo: {
        year,
        month: month ?? null,
        label: atual.label,
        from: atual.from_day,
        to: atual.to_day,
        anterior: anterior.label,
      },

      kpis: {
        total: linha.total,
        abertos: linha.abertos,
        encaminhados: linha.encaminhados,
        em_andamento: linha.em_andamento,
        concluidos: linha.concluidos,
        atrasados: linha.atrasados,
        // O tempo de resolução conta os que FECHARAM no período, e não os que
        // nasceram nele: um chamado de março fechado em abril é trabalho de
        // abril, e atribuí-lo a março faria o mês corrente parecer sempre mais
        // rápido do que foi.
        tempo_medio_dias_uteis: linha.tempo_medio,
        pct_dentro_sla: pctSla,
        fechados_no_periodo: linha.fechados,

        variacao: {
          total: variacao(linha.total, linha.total_anterior),
          concluidos: variacao(linha.concluidos, linha.concluidos_anterior),
          atrasados: variacao(linha.atrasados, linha.atrasados_anterior),
          tempo_medio_dias_uteis:
            linha.tempo_medio !== null && linha.tempo_medio_anterior !== null
              ? linha.tempo_medio - linha.tempo_medio_anterior
              : null,
          // Em pontos percentuais, não em percentual de percentual: "subiu 6 pp"
          // é a leitura certa de 68% para 74%.
          pct_dentro_sla:
            pctSla !== null && pctSlaAnterior !== null ? pctSla - pctSlaAnterior : null,
        },

        anterior: {
          total: linha.total_anterior,
          concluidos: linha.concluidos_anterior,
          atrasados: linha.atrasados_anterior,
          tempo_medio_dias_uteis: linha.tempo_medio_anterior,
          pct_dentro_sla: pctSlaAnterior,
        },
      },

      funil: {
        etapas,
        gargalo: gargalo ? `${gargalo.de}->${gargalo.para}` : null,
        // A primeira etapa parte da meia-noite do dia da vistoria: o dado não
        // tem hora, então a medida dela é grossa e a tela precisa dizer isso.
        etapa1_granularidade: 'DIA',
      },

      /**
       * O ano mês a mês.
       *
       * Sempre os doze, mesmo os vazios: uma série que pula os meses sem dado
       * desenha uma linha que mente sobre o intervalo entre os pontos. Vai
       * sempre do ano escolhido, e não do período — a série existe justamente
       * para pôr o mês selecionado dentro do ano dele.
       */
      evolucao: {
        year,
        meses: Array.from({ length: 12 }, (_, i) => {
          const encontrado = meses.find((m) => m.mes === i + 1);
          return {
            mes: i + 1,
            abertos: encontrado?.abertos ?? 0,
            fechados: encontrado?.fechados ?? 0,
          };
        }),
      },

      /**
       * A saúde do processo — o que o tempo de cada etapa não conta.
       *
       * Cada número aqui existe porque muda uma decisão: o saldo diz se a fila
       * cresce, a idade do mais velho diz se há coisa apodrecendo, o sem
       * movimento diz o que foi esquecido, o retrabalho diz se a triagem está
       * errando o alvo, e a cobertura de custo diz se o bloco de custos vale
       * alguma coisa. Os que são "agora" vêm marcados como tal.
       */
      processo: {
        balanco: {
          nasceram: processo.nasceram,
          fecharam: processo.fecharam,
          // Positivo, a fila cresceu: entrou mais do que saiu. É o número que
          // decide se falta gente, e o painel não tinha nenhum equivalente.
          saldo: processo.nasceram - processo.fecharam,
          saldo_anterior: processo.nasceram_anterior - processo.fecharam_anterior,
        },

        fila_hoje: {
          em_aberto: processo.em_aberto_agora,
          mais_velho_dias_uteis: processo.backlog_mais_velho,
          mediana_dias_uteis: processo.backlog_mediana,
          sem_movimento: processo.sem_movimento,
          sem_movimento_desde_dias: DIAS_SEM_MOVIMENTO,
        },

        desvios: {
          fechados_sem_responsavel: processo.fechados_sem_responsavel,
          com_volta: processo.com_volta,
          reencaminhados: processo.reencaminhados,
        },

        registro: {
          concluidos_com_custo: processo.concluidos_com_custo,
          pct_com_custo: percentual(processo.concluidos_com_custo, processo.fecharam),
          altas: processo.altas,
          pct_altas: percentual(processo.altas, processo.nasceram),
        },
      },

      sla: {
        metas: SLA_BUSINESS_DAYS,
        // Estes dois são do eixo do fechamento: é sobre o que terminou no
        // período que faz sentido dizer "cumpriu o prazo" ou "não cumpriu".
        dentro,
        atrasados: linha.fechados - dentro,
        por_prioridade: porPrioridade(prioridades),
        em_risco: emRisco,
      },
    };
  },

  /**
   * Os responsáveis do prédio — comparados, ou um só por inteiro.
   *
   * Sem `responsible_id`, a resposta é a tabela: todo mundo lado a lado, com as
   * mesmas colunas, para a comparação ser possível de relance. Abrir a análise
   * completa de cada pessoa numa lista de oito seria oito telas empilhadas, e
   * ninguém compara rolando.
   *
   * Com `responsible_id`, a resposta é a pessoa: os mesmos números, mais a
   * média da equipe ao lado de cada um — porque "7,2 dias" só vira julgamento
   * quando se sabe que a equipe faz em 5 — e a lista do que ela tem atrasado
   * na mão agora.
   */
  async responsibles(buildingId: string, filters: AnalyticsFilters) {
    const agora = zonedParts();
    const year = filters.year ?? agora.year;
    const { month } = filters;

    const atual = resolvePeriod(year, month);

    // O escopo da tabela ignora o responsável escolhido: a comparação é entre
    // todos, e filtrar por um deixaria a "média da equipe" ser a média de um.
    const escopoDoPredio = await scopeDe(buildingId, { ...filters, responsible_id: undefined });
    const linhas = await analyticsRepository.porResponsavel(escopoDoPredio, atual);

    const comMetricas = linhas.map((r) => ({
      ...r,
      taxa_atraso: percentual(r.fechados_atrasados, r.concluidos),
      pct_sla:
        r.concluidos === 0 ? null : percentual(r.concluidos - r.fechados_atrasados, r.concluidos),
    }));

    const periodo = {
      year,
      month: month ?? null,
      label: atual.label,
      anterior: previousPeriod(year, month).label,
    };

    if (!filters.responsible_id) {
      return { periodo, modo: 'TODOS' as const, equipe: media(comMetricas), linhas: comMetricas };
    }

    // Confere o vínculo antes de devolver qualquer coisa da pessoa.
    const escopoDaPessoa = await scopeDe(buildingId, filters);
    const pessoa = comMetricas.find((r) => r.id === filters.responsible_id);

    const atrasados = await analyticsRepository.atrasadosAbertos(escopoDaPessoa);

    return {
      periodo,
      modo: 'INDIVIDUAL' as const,
      equipe: media(comMetricas),
      // Vinculado mas sem nenhum chamado no recorte: a pessoa existe, e a tela
      // precisa poder dizer "nada neste período" em vez de "não encontrado".
      pessoa: pessoa ?? null,
      atrasados,
    };
  },

  inspectors: inspectorsService,
};

/**
 * Os inspetores do prédio, e o rigor de cada ronda.
 *
 * Fica atrás da guarda de gestor na rota, e não só escondido na tela: quem
 * vistoria é avaliado por quem gere o prédio, não pelo moderador que recebe as
 * ocorrências dele. Esconder o botão e deixar a rota aberta seria a permissão
 * existir só no navegador.
 */
export async function inspectorsService(buildingId: string, filters: AnalyticsFilters) {
  const agora = zonedParts();
  const year = filters.year ?? agora.year;
  const { month } = filters;
  const atual = resolvePeriod(year, month);

  const [linhas, totalAndares] = await Promise.all([
    analyticsRepository.porInspetor({ building_id: buildingId }, atual),
    analyticsRepository.totalDeAndares(buildingId),
  ]);

  const comMetricas = linhas.map((i) => ({
    ...i,
    /** Quanto do prédio a pessoa cobriu no período. */
    cobertura: totalAndares === 0 ? null : percentual(i.andares_distintos, totalAndares),
    /**
     * Ocorrências por vistoria.
     *
     * É o número que separa a ronda atenta da ronda apressada — e por isso ele
     * não vem com juízo embutido: zero pode ser prédio em ordem, e a tela diz
     * as duas leituras em vez de escolher uma.
     */
    por_vistoria: i.vistorias === 0 ? null : i.ocorrencias / i.vistorias,
    pct_sem_ocorrencia: percentual(i.vistorias_sem_ocorrencia, i.vistorias),
    pct_altas: percentual(i.altas, i.ocorrencias),
  }));

  const vistorias = comMetricas.reduce((s, i) => s + i.vistorias, 0);
  const ocorrencias = comMetricas.reduce((s, i) => s + i.ocorrencias, 0);

  return {
    periodo: { year, month: month ?? null, label: atual.label },
    total_andares: totalAndares,
    equipe: {
      pessoas: comMetricas.length,
      vistorias,
      ocorrencias,
      por_vistoria: vistorias === 0 ? null : ocorrencias / vistorias,
    },
    linhas: comMetricas,
  };
}

/** A média da equipe, para o modo individual ter contra o que comparar. */
function media(linhas: Array<{ concluidos: number; tempo_medio: number | null; fechados_atrasados: number }>) {
  const comTempo = linhas.filter((l) => l.tempo_medio !== null);
  const concluidos = linhas.reduce((s, l) => s + l.concluidos, 0);
  const atrasados = linhas.reduce((s, l) => s + l.fechados_atrasados, 0);

  return {
    pessoas: linhas.length,
    concluidos_por_pessoa: linhas.length === 0 ? null : concluidos / linhas.length,
    tempo_medio:
      comTempo.length === 0
        ? null
        : comTempo.reduce((s, l) => s + (l.tempo_medio ?? 0), 0) / comTempo.length,
    pct_sla: concluidos === 0 ? null : percentual(concluidos - atrasados, concluidos),
  };
}
