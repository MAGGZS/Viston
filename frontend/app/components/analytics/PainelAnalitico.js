'use client';
import { useRouter } from 'next/navigation';
import { Card } from '@/app/components/ui';
import {
  useAnalyticsInspectors,
  useAnalyticsOverview,
  useAnalyticsResponsibles,
  useBuildingResponsibles,
  useFloors,
} from '@/app/hooks/useApi';
import { T, W } from '@/app/lib/theme';
import { AnaliseDeSla } from './AnaliseDeSla';
import { Desempenho } from './Desempenho';
import { ESPACO, Relogio, TIPO } from './escala';
import { EvolucaoMensal } from './EvolucaoMensal';
import { FiltrosDoPainel, useFiltrosDoPainel } from './FiltrosDoPainel';
import { FunilDeEtapas } from './FunilDeEtapas';
import { ResumoDoPeriodo } from './ResumoDoPeriodo';
import { SaudeDoProcesso } from './SaudeDoProcesso';
import { SeletorDeVisao } from './SeletorDeVisao';

/**
 * O painel analítico do prédio.
 *
 * Mora fora das páginas porque o moderador e o gestor veem a mesma tela em
 * rotas diferentes — duas cópias divergiriam num bloco de cada vez, e este é o
 * lugar onde dois números diferentes para a mesma pergunta são o pior defeito
 * possível.
 *
 * Duas visões, alternadas em pilha:
 *
 * - **Processos** responde sobre o prédio: quanto entrou, como o ano andou,
 *   onde trava, o que está fora do prazo, o que foi esquecido.
 * - **Desempenho** responde sobre gente. É visão separada e não mais um bloco
 *   no fim da rolagem porque comparar uma equipe exige a tela inteira, e quem
 *   abriu o painel para ver o prédio não quer atravessar a equipe até o
 *   gargalo.
 *
 * Os filtros ficam acima do alternador porque valem para as duas: repeti-los
 * dentro de cada uma faria a troca de aba parecer reiniciar o recorte.
 */

const VISOES = [
  { key: 'PROCESSOS', tab: 'Processos' },
  { key: 'DESEMPENHO', tab: 'Desempenho' },
];

/**
 * Um bloco do painel.
 *
 * O cabeçalho tem três partes fixas, e a ordem não muda de bloco para bloco: o
 * que ele é, de que relógio ele lê, e o que ele quer dizer. A etiqueta de
 * relógio é a única decoração da tela que carrega informação — ver `Relogio`.
 *
 * `height: 100%` com o miolo em `flex: 1` é o que mantém uma fileira de dois
 * cartões alinhada. Sem isso cada um termina onde o conteúdo dele acaba, e a
 * fileira fica com um degrau no pé.
 */
function Bloco({ titulo, relogio, agora = false, descricao, children, style = {} }) {
  return (
    <Card
      style={{
        padding: ESPACO.xl, height: '100%',
        display: 'flex', flexDirection: 'column', gap: ESPACO.lg, ...style,
      }}
    >
      <div>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: ESPACO.md, marginBottom: descricao ? ESPACO.xs : 0,
          }}
        >
          <h2 style={{ ...TIPO.titulo, color: T.text }}>{titulo}</h2>
          {relogio && <Relogio agora={agora}>{relogio}</Relogio>}
        </div>
        {descricao && <p style={{ ...TIPO.meta, color: T.faint }}>{descricao}</p>}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
    </Card>
  );
}

function Erro({ error }) {
  return (
    <Card style={{ padding: ESPACO.xl }}>
      <p style={{ ...TIPO.corpo, color: T.danger, fontWeight: W.strong }}>
        Não foi possível carregar o painel.
      </p>
      <p style={{ ...TIPO.meta, color: T.mute, marginTop: ESPACO.xs }}>
        {error?.response?.data?.error?.message ?? 'Tente de novo em instantes.'}
      </p>
    </Card>
  );
}

export function PainelAnalitico({ buildingId, baseChamados, podeVerInspetores = false }) {
  const router = useRouter();
  const { estado, filtros, filtrosDeEquipe, trocar, limpar } = useFiltrosDoPainel();

  const emDesempenho = estado.visao === 'DESEMPENHO';
  const emInspetores = podeVerInspetores && estado.equipe === 'INSPETORES';
  /**
   * O chip de responsável só aparece onde ele é aplicado.
   *
   * Em processos ele não entra na consulta — o funil e o SLA são do prédio, não
   * de uma pessoa. Em inspetores ele também não: quem vistoria e quem resolve
   * são listas diferentes, e filtrar uma pela outra não quer dizer nada.
   */
  const filtraPorResponsavel = emDesempenho && !emInspetores;

  const overview = useAnalyticsOverview(buildingId, filtros);
  // Cada consulta varre o prédio inteiro: só a visão aberta é buscada, e a de
  // inspetores só para quem pode vê-la — sem isso a tela do moderador dispara
  // uma requisição que volta 403 a cada visita.
  const responsaveis = useAnalyticsResponsibles(buildingId, filtrosDeEquipe, filtraPorResponsavel);
  const inspetores = useAnalyticsInspectors(buildingId, filtros, emDesempenho && emInspetores);

  const { data: listaResponsaveis } = useBuildingResponsibles(buildingId);
  const { data: andaresData } = useFloors(buildingId);

  /**
   * O caminho do número para a lista.
   *
   * Um indicador sem caminho para o detalhe não ajuda a decidir: quem lê "5 em
   * risco" precisa chegar aos cinco. A lista de chamados já filtra por tudo o
   * que o painel recorta, então o detalhe é um endereço, não uma tela nova.
   */
  const abrirChamado = baseChamados
    ? (ticket) => router.push(`${baseChamados}/processamento?chamado=${ticket.id}`)
    : undefined;

  const atual = emDesempenho ? (emInspetores ? inspetores : responsaveis) : overview;
  if (atual.isError) return <Erro error={atual.error} />;

  // Enquanto a primeira busca não volta não há período a anunciar, e escrever
  // "2026" antes de saber é a tela afirmando o que ainda não sabe.
  const periodo = overview.data?.periodo;
  const doPeriodo = periodo ? periodo.label.toLowerCase() : 'o período';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.lg }}>
      <FiltrosDoPainel
        estado={estado}
        trocar={trocar}
        limpar={limpar}
        responsaveis={listaResponsaveis ?? []}
        andares={andaresData?.floors ?? []}
        mostrarResponsavel={filtraPorResponsavel}
      />

      <SeletorDeVisao
        views={VISOES}
        value={estado.visao}
        onSelect={(v) => trocar('visao', v === VISOES[0].key ? '' : v)}
        label="Visões do painel analítico"
      />

      {emDesempenho ? (
        <Bloco
          titulo="Desempenho"
          relogio={periodo?.label}
          descricao="Quem trabalha no prédio, medido pelo trabalho que faz."
        >
          <Desempenho
            equipe={estado.equipe}
            responsaveis={responsaveis}
            inspetores={inspetores}
            podeVerInspetores={podeVerInspetores}
            onTrocarEquipe={(v) => trocar('equipe', v === 'RESPONSAVEIS' ? '' : v)}
            onSelecionarResponsavel={(id) => trocar('resp', id)}
          />
        </Bloco>
      ) : (
        <>
          <Bloco
            titulo="Resumo do período"
            relogio={periodo?.label}
            descricao={`Chamados abertos em ${doPeriodo} e onde eles estão hoje. O atraso conta do dia da vistoria, e vale também para os que já fecharam.`}
          >
            <ResumoDoPeriodo kpis={overview.data?.kpis} periodo={periodo} loading={overview.isLoading} />
          </Bloco>

          <Bloco
            titulo="O ano mês a mês"
            relogio={String(overview.data?.evolucao?.year ?? periodo?.year ?? '')}
            descricao="A fila cresce quando entra mais do que sai. Clique num mês para recortar a tela inteira por ele."
          >
            <EvolucaoMensal
              evolucao={overview.data?.evolucao}
              mesSelecionado={estado.mes ? Number(estado.mes) : null}
              loading={overview.isLoading}
              onSelecionarMes={(m) => trocar('mes', m)}
            />
          </Bloco>

          <div
            style={{
              display: 'grid',
              // Duas colunas iguais que viram uma abaixo de ~870px. `stretch` é
              // o padrão do grid e é o que se quer: os dois cartões terminam na
              // mesma linha, e o que sobra de altura no menor vira vão interno
              // em vez de degrau no pé da tela.
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
              gap: ESPACO.lg,
            }}
          >
            <Bloco
              titulo="Funil e gargalos"
              relogio={periodo?.label}
              descricao="Cada etapa é uma ação que alguém precisa tomar. A coluna mais alta é onde o processo trava."
            >
              <FunilDeEtapas
                funil={overview.data?.funil}
                periodoLabel={periodo?.label}
                loading={overview.isLoading}
              />
            </Bloco>

            <Bloco
              titulo="Análise de SLA"
              relogio={periodo?.label}
              descricao="Prazo em dias úteis contado do dia da vistoria. O percentual é sobre o que foi concluído no período."
            >
              <AnaliseDeSla
                sla={overview.data?.sla}
                kpis={overview.data?.kpis}
                periodo={periodo}
                loading={overview.isLoading}
                onAbrirChamado={abrirChamado}
              />
            </Bloco>
          </div>

          <Bloco
            titulo="Saúde do processo"
            relogio="período e agora"
            descricao="O que o tempo de cada etapa não conta: se a fila cresce, o que envelheceu no fundo dela, o que foi esquecido e onde o fluxo foi pulado."
          >
            <SaudeDoProcesso
              processo={overview.data?.processo}
              periodo={periodo}
              loading={overview.isLoading}
            />
          </Bloco>
        </>
      )}
    </div>
  );
}
