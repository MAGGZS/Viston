import {
  analyticsRepository,
  AnalyticsScope,
  DimensaoRow,
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

/**
 * As faixas da distribuição de tempo de resolução, em dias úteis.
 *
 * Os cortes param nos prazos do produto — 5, 10 e 15 — de propósito: cada barra
 * se lê contra uma promessa, e não contra um corte arbitrário. `acima` marca as
 * faixas em que nenhuma prioridade cumpre o prazo, e é o que a tela pinta.
 *
 * A última é aberta porque a cauda não tem fim: amarrá-la a um teto esconderia
 * exatamente quem está longe dele. Os `id` casam com o `CASE` de
 * `analyticsRepository.distribuicaoDeCiclo`, e as duas listas precisam andar
 * juntas — por isso o teste as compara.
 */
export const FAIXAS_DE_CICLO = [
  { id: '0-1', rotulo: '0-1', rotuloCompleto: 'até 1 dia útil', acima: false },
  { id: '2', rotulo: '2', rotuloCompleto: '2 dias úteis', acima: false },
  { id: '3', rotulo: '3', rotuloCompleto: '3 dias úteis', acima: false },
  { id: '4-5', rotulo: '4-5', rotuloCompleto: '4 a 5 dias úteis', acima: false },
  { id: '6-7', rotulo: '6-7', rotuloCompleto: '6 a 7 dias úteis', acima: false },
  { id: '8-10', rotulo: '8-10', rotuloCompleto: '8 a 10 dias úteis', acima: false },
  { id: '11-15', rotulo: '11-15', rotuloCompleto: '11 a 15 dias úteis', acima: false },
  { id: '15+', rotulo: '15+', rotuloCompleto: 'acima de 15 dias úteis', acima: true },
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
 * Quantas observações um percentual precisa ter para ser lido como sinal.
 *
 * Cinco é pouco, e é de propósito: não é rigor estatístico, é o ponto em que
 * "um de dois deu errado" para de ser desenhado com o mesmo peso de "trinta de
 * duzentos". Abaixo daqui o painel mostra o número em cinza e diz sobre quantos
 * chamados ele fala, em vez de pintar de vermelho um mês em que fecharam dois.
 */
export const N_MINIMO = 5;

/** O número sustenta uma leitura, ou é ruído com cara de sinal. */
export function confiavel(n: number): boolean {
  return n >= N_MINIMO;
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
 * A fila acumulada mês a mês, a partir do que já estava aberto em janeiro.
 *
 * O saldo mensal — nasceram menos fecharam — oscila em torno do zero e não
 * conta história nenhuma: um mês com saldo +3 pode ser um prédio em ordem ou um
 * prédio afundando, e a barra é idêntica nos dois casos. A soma corrida é que
 * mostra a direção, e é a série que o painel desenha por cima das barras.
 */
export function acumular<T extends { mes: number; abertos: number; fechados: number }>(
  meses: T[],
  inicial: number,
  /**
   * O último mês que já aconteceu. Os seguintes vêm marcados como futuro.
   *
   * Sem a marca, a soma corrida carrega o valor de setembro por outubro,
   * novembro e dezembro, e a linha segue reta até o fim do ano — desenhando
   * como previsão o que é só ausência de dado. O gráfico para onde o ano parou.
   */
  ultimoMes = 12
) {
  let corrente = inicial;

  return meses.map((m) => {
    corrente += m.abertos - m.fechados;
    return {
      ...m,
      saldo: m.abertos - m.fechados,
      acumulado: corrente,
      futuro: m.mes > ultimoMes,
    };
  });
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

    const [linha, prioridades, emRisco, processo, meses, saldoInicial, fila, faixas] =
      await Promise.all([
        analyticsRepository.overview(scope, atual, anterior),
        analyticsRepository.porPrioridade(scope, atual),
        analyticsRepository.emRisco(scope),
        analyticsRepository.saudeDoProcesso(scope, atual, anterior, DIAS_SEM_MOVIMENTO),
        analyticsRepository.evolucaoMensal(scope, year),
        analyticsRepository.backlogNoInicioDoAno(scope, year),
        analyticsRepository.filaAcionavel(scope, DIAS_SEM_MOVIMENTO),
        analyticsRepository.distribuicaoDeCiclo(scope, atual),
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
        /**
         * O tempo de ciclo em percentis — o que a tela mostra no lugar da média.
         *
         * A média continua acima porque outras leituras ainda a consomem, mas
         * ela não é o número de capa: tempo de resolução é distribuição torta
         * para a direita, e um chamado de seis meses no meio de doze levantava
         * a média em semanas sem que nada tivesse mudado para os outros onze.
         *
         * Os dois nunca aparecem sozinhos na tela: os dois contam só o que
         * fechou, e o que fechou é a amostra que sobreviveu. Enquanto o prédio
         * piora, o chamado lento fica de fora da conta e o número melhora. O
         * antídoto é lê-los ao lado da idade da fila ainda aberta, em
         * `processo.fila_hoje`.
         */
        ciclo_p50_dias_uteis: linha.ciclo_p50,
        ciclo_p90_dias_uteis: linha.ciclo_p90,
        pct_dentro_sla: pctSla,
        fechados_no_periodo: linha.fechados,

        /**
         * Sobre quantos chamados cada leitura fala.
         *
         * Um percentual sem denominador é uma afirmação sem sujeito: "50%
         * dentro do prazo" sobre dois chamados fechados e "50%" sobre duzentos
         * são a mesma tipografia e coisas diferentes. A tela usa `minimo` para
         * decidir quando pintar e quando só informar.
         */
        amostra: {
          minimo: N_MINIMO,
          /** Base de `pct_dentro_sla` e dos percentis de ciclo. */
          fechados: linha.fechados,
          fechados_anterior: linha.fechados_anterior,
          /** Base da composição por estado e de `atrasados`. */
          nascidos: linha.total,
          nascidos_anterior: linha.total_anterior,
        },

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
          ciclo_p50_dias_uteis: linha.ciclo_p50_anterior,
          ciclo_p90_dias_uteis: linha.ciclo_p90_anterior,
          pct_dentro_sla: pctSlaAnterior,
        },
      },

      funil: {
        etapas,
        gargalo: gargalo ? `${gargalo.de}->${gargalo.para}` : null,
        // A primeira etapa passou a partir de `floor_form_entries.completed_at`,
        // o instante em que o inspetor fechou o andar — e não mais da meia-noite
        // do dia da vistoria. A medida tem hora, e a tela não precisa mais
        // avisar que a etapa 1 é grossa.
        etapa1_granularidade: 'HORA',
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
        /**
         * O que já estava aberto quando o ano começou — o degrau de onde a
         * linha acumulada parte. Sem ele, a fila pareceria nascer em janeiro.
         */
        saldo_inicial: saldoInicial,
        meses: acumular(
          Array.from({ length: 12 }, (_, i) => {
            const encontrado = meses.find((m) => m.mes === i + 1);
            return {
              mes: i + 1,
              abertos: encontrado?.abertos ?? 0,
              fechados: encontrado?.fechados ?? 0,
            };
          }),
          saldoInicial,
          // Ano corrente para no mês de hoje; ano passado teve os doze.
          year === agora.year ? agora.monthIndex + 1 : 12
        ),
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

      /**
       * O que pede ação hoje — e o único bloco do painel que não é retrospecto.
       *
       * Vai no topo da tela, e não dentro do bloco de SLA onde os dez "em
       * risco" moravam: é o que muda o dia de quem abre o painel, e o resto
       * responde à pergunta de quem para para pensar no mês.
       *
       * As três listas saem separadas, e não numa só ordenada: são três
       * decisões diferentes. Atrasado já estourou — não há prazo a salvar. Em
       * risco é o único em que agir hoje muda o número de amanhã. Parado pode
       * estar dentro do prazo e mesmo assim esquecido, e é o que some da vista
       * justamente por não estar gritando.
       */
      fila_acionavel: {
        sem_movimento_desde_dias: DIAS_SEM_MOVIMENTO,
        atrasados: fila.filter((t) => t.motivo === 'ATRASADO'),
        em_risco: fila.filter((t) => t.motivo === 'EM_RISCO'),
        parados: fila.filter((t) => t.motivo === 'PARADO'),
      },

      sla: {
        metas: SLA_BUSINESS_DAYS,

        /**
         * A forma da distribuição, que dois percentis não dão.
         *
         * p50 de 5 e p90 de 15 descrevem tanto a massa concentrada em 5 com
         * três chamados perdidos lá atrás quanto uma rampa parelha de 5 a 15.
         * São problemas diferentes, pedem ações diferentes, e os dois números
         * são iguais nos dois casos.
         *
         * As faixas vêm sempre todas, na ordem, mesmo as vazias: uma
         * distribuição que pula a faixa sem chamado desenha uma forma que não
         * é a dela. Mesma escolha dos doze meses de `evolucao`.
         */
        distribuicao: FAIXAS_DE_CICLO.map((faixa) => {
          const encontrada = faixas.find((f) => f.faixa === faixa.id);
          return {
            ...faixa,
            n: encontrada?.n ?? 0,
            n_atrasados: encontrada?.n_atrasados ?? 0,
          };
        }),
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
      /**
       * De que a carga da pessoa é feita.
       *
       * Sem isto, a tabela compara taxa de atraso entre gente que não recebeu o
       * mesmo trabalho: prioridade alta tem cinco dias úteis de prazo, baixa
       * tem quinze, e quem pega as altas aparece pior fazendo o serviço mais
       * difícil. A tela não pode pintar ninguém de vermelho sem mostrar isto ao
       * lado.
       */
      carga: { ALTA: r.altas, MEDIA: r.medias, BAIXA: r.baixas },
      /** O painel não pinta ninguém com menos que isto de amostra. */
      confiavel: confiavel(r.concluidos),
    }));

    const periodo = {
      year,
      month: month ?? null,
      label: atual.label,
      anterior: previousPeriod(year, month).label,
    };

    if (!filters.responsible_id) {
      return {
        periodo,
        modo: 'TODOS' as const,
        equipe: media(comMetricas),
        minimo: N_MINIMO,
        linhas: comMetricas,
      };
    }

    // Confere o vínculo antes de devolver qualquer coisa da pessoa.
    const escopoDaPessoa = await scopeDe(buildingId, filters);
    const pessoa = comMetricas.find((r) => r.id === filters.responsible_id);

    const atrasados = await analyticsRepository.atrasadosAbertos(escopoDaPessoa);

    return {
      periodo,
      modo: 'INDIVIDUAL' as const,
      equipe: media(comMetricas),
      minimo: N_MINIMO,
      // Vinculado mas sem nenhum chamado no recorte: a pessoa existe, e a tela
      // precisa poder dizer "nada neste período" em vez de "não encontrado".
      pessoa: pessoa ?? null,
      atrasados,
    };
  },

  queue: queueService,

  building: buildingService,

  inspectors: inspectorsService,
};

/**
 * Quantos chamados pedem atenção agora — só os números.
 *
 * Existe para o painel inicial, que mostra "fora do prazo" num cartão e não
 * lista nada. O `overview` responderia a mesma pergunta, mas custa nove
 * consultas ao prédio inteiro para entregar um número; esta custa uma.
 *
 * Não aceita filtro de período de propósito, e nem o schema o oferece aqui: a
 * fila é sempre de agora e do prédio inteiro. Um cartão de "fora do prazo" que
 * obedecesse ao mês escolhido esconderia o chamado de março que está atrasado
 * hoje, que é justamente o que ele existe para mostrar.
 */
export async function queueService(buildingId: string) {
  const scope = await scopeDe(buildingId, {});
  const fila = await analyticsRepository.contagemDaFila(scope, DIAS_SEM_MOVIMENTO);

  return {
    atrasados: fila.atrasados,
    em_risco: fila.em_risco,
    parados: fila.parados,
    em_aberto: fila.em_aberto,
    /** O total é a soma dos três motivos, e não `em_aberto`: nem todo chamado
     *  aberto pede atenção. É o mesmo número que o bloco "Pede atenção" mostra. */
    pedem_atencao: fila.atrasados + fila.em_risco + fila.parados,
    sem_movimento_desde_dias: DIAS_SEM_MOVIMENTO,
  };
}

/**
 * Abaixo de que cobertura o custo deixa de ser um total e vira uma amostra.
 *
 * Metade. Não é estatística: é o ponto em que apresentar a soma como "o custo
 * do período" passa a ser uma afirmação falsa sobre o prédio, e não um número
 * incompleto. Acima disso a tela mostra o total com a cobertura ao lado; abaixo,
 * o bloco inteiro entra em estado degradado e diz sobre quantos chamados ele
 * está falando antes de dizer qualquer valor.
 */
export const COBERTURA_MINIMA = 50;

/** Quantas vezes o mesmo par andar+tipo precisa aparecer para ser reincidência. */
export const REINCIDENCIA_MINIMA = 2;

/**
 * O prédio: quanto custou e o que reincide.
 *
 * A terceira aba do painel, e o terceiro assunto. "Processos" fala do caminho
 * que o chamado faz, "Desempenho" fala das pessoas que o fazem andar — e nenhum
 * dos dois fala do prédio, que é o que o cliente do sistema de fato compra. O
 * painel sabia dizer que quarenta chamados fecharam; não sabia dizer quanto
 * custaram, em que andar, nem que o sétimo andar teve infiltração cinco vezes
 * em seis meses.
 *
 * Tudo sai da mesma CTE `base()` das outras consultas, que já trazia
 * `maintenance_cost`, `maintenance_type` e `floor_id` sem ninguém os somar.
 */
export async function buildingService(buildingId: string, filters: AnalyticsFilters) {
  const agora = zonedParts();
  const year = filters.year ?? agora.year;
  const { month } = filters;

  const atual = resolvePeriod(year, month);
  const anterior = previousPeriod(year, month);
  const scope = await scopeDe(buildingId, filters);

  const [custo, dimensoes, perfil, recorrencia] = await Promise.all([
    analyticsRepository.custo(scope, atual, anterior),
    analyticsRepository.custoPorDimensao(scope, atual),
    analyticsRepository.perfilMensal(scope, year),
    analyticsRepository.recorrencia(scope, atual),
  ]);

  const daDimensao = (dimensao: DimensaoRow['dimensao']) =>
    dimensoes
      .filter((d) => d.dimensao === dimensao)
      .map((d) => ({
        chave: d.chave,
        rotulo: d.rotulo,
        n: d.n,
        n_com_custo: d.n_com_custo,
        total: d.total,
        /** Custo médio do que teve valor lançado — não do que fechou. */
        media: d.n_com_custo === 0 ? null : d.total / d.n_com_custo,
      }));

  const cobertura = percentual(custo.n_com_custo, custo.fechados);

  /**
   * As categorias de cada mês, sempre todas as cinco.
   *
   * Uma série que omite a categoria sem ocorrência no mês desenha uma área
   * empilhada com buraco, e o buraco se lê como queda. Mesma escolha dos doze
   * meses de `evolucao` e das três prioridades de `porPrioridade`.
   */
  const CATEGORIAS = ['PREVENTIVA', 'CORRETIVA', 'EMERGENCIAL', 'EVENTOS', 'PROJETOS'] as const;

  const perfilMeses = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const doMes = perfil.filter((p) => p.mes === mes);
    const contagens = Object.fromEntries(
      CATEGORIAS.map((c) => [c, doMes.find((p) => p.categoria === c)?.n ?? 0])
    ) as Record<(typeof CATEGORIAS)[number], number>;

    const total = Object.values(contagens).reduce((s, n) => s + n, 0);

    return {
      mes,
      ...contagens,
      total,
      /** Corretiva e emergencial juntas: as duas são o prédio já quebrado. */
      pct_reativa: percentual(contagens.CORRETIVA + contagens.EMERGENCIAL, total),
      futuro: year === agora.year && mes > agora.monthIndex + 1,
    };
  });

  /**
   * O percentual reativo do período, no mesmo eixo da série mensal.
   *
   * Sai dos meses, e não da quebra por categoria de `custoPorDimensao`. As duas
   * fontes existem e respondem a perguntas diferentes: a quebra por categoria é
   * do eixo do fechamento, porque ela acompanha o custo; a série é do eixo da
   * abertura, porque a categoria descreve por que a ocorrência nasceu.
   *
   * Misturá-las punha "67% reativa" no título e "64% reativa" no ponto de
   * agosto do gráfico logo abaixo — dois números da mesma métrica na mesma
   * tela, cada um com uma base. É o defeito que este painel existe para não ter.
   *
   * Mês escolhido lê aquele mês; ano inteiro soma os doze. A série é sempre do
   * ano, e o período nunca é maior que ele.
   */
  const mesesDoPeriodo = month ? perfilMeses.filter((m) => m.mes === month) : perfilMeses;
  const reativasNoPeriodo = mesesDoPeriodo.reduce(
    (s, m) => s + m.CORRETIVA + m.EMERGENCIAL,
    0
  );
  const totalCategorias = mesesDoPeriodo.reduce((s, m) => s + m.total, 0);

  return {
    periodo: {
      year,
      month: month ?? null,
      label: atual.label,
      anterior: anterior.label,
    },

    custo: {
      total: custo.total,
      total_anterior: custo.total_anterior,
      variacao: variacao(custo.total, custo.total_anterior),
      ticket_medio: custo.ticket_medio,
      ticket_p50: custo.ticket_p50,

      /**
       * Sobre o que este total fala.
       *
       * Vai antes das quebras de propósito: quem lê "R$ 4.200 em manutenção"
       * precisa saber, na mesma respiração, que isso cobre um de nove chamados
       * fechados. Sem o par, o painel afirma sobre o prédio o que sabe só sobre
       * uma linha.
       */
      cobertura: {
        n_com_custo: custo.n_com_custo,
        n_com_custo_anterior: custo.n_com_custo_anterior,
        fechados: custo.fechados,
        pct: cobertura,
        minima: COBERTURA_MINIMA,
        confiavel: cobertura !== null && cobertura >= COBERTURA_MINIMA,
      },

      por_tipo: daDimensao('TIPO'),
      por_categoria: daDimensao('CATEGORIA'),
      por_andar: daDimensao('ANDAR'),
    },

    perfil: {
      year,
      categorias: CATEGORIAS,
      meses: perfilMeses,
      pct_reativa: percentual(reativasNoPeriodo, totalCategorias),
      amostra: { nascidos: totalCategorias, minimo: N_MINIMO },
    },

    recorrencia: {
      minima: REINCIDENCIA_MINIMA,
      /** Toda a grade, para a matriz desenhar inclusive as células vazias. */
      celulas: recorrencia,
      /**
       * O que apareceu mais de uma vez no mesmo andar, do mesmo tipo.
       *
       * É a lista que transforma "fechamos quarenta chamados" em "o sétimo
       * andar teve infiltração cinco vezes; parar de remendar". Ordenada pela
       * contagem, e depois pelo custo acumulado — reincidência cara antes de
       * reincidência barata.
       */
      reincidentes: recorrencia.filter((r) => r.n >= REINCIDENCIA_MINIMA),
    },
  };
}

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
