'use client';
import { useMemo, useState } from 'react';
import { PeriodoFiltro } from '@/app/components/PeriodoFiltro';
import { Button } from '@/app/components/ui';
import { VisualizadorShell, useVisualizadorBuilding } from '@/app/components/VisualizadorShell';
import { useSupervisorOverview } from '@/app/hooks/useApi';
import { useAuthStore } from '@/app/store/auth';
import { intervaloDe } from '@/app/lib/periodo';
import { codigoDoErro } from '@/app/lib/erros';
import { T, R, W } from '@/app/lib/theme';
import {
  Bloco,
  CalendarioDoPainel,
  ChamadosPorStatus,
  CoberturaDeAndares,
  DesempenhoInspetores,
  GraficoAgendamentos,
  LinkParaAgenda,
  NumerosDaAgenda,
} from './_componentes/PainelSupervisor';
import { InspecoesRecentes } from './_componentes/InspecoesRecentes';
import { BotaoAjuda } from '@/app/components/ajuda/BotaoAjuda';

function primeiroNome(nome = '') {
  return nome.trim().split(/\s+/)[0] ?? '';
}

/**
 * O painel do visualizador — quem supervisiona os inspetores do prédio.
 *
 * Responde, nesta ordem: como anda a agenda (os quatro números), quem está
 * fazendo o trabalho, e onde o prédio está sendo esquecido. A tabela de
 * vistorias recentes ficou no pé: é dali que se baixa a planilha e se abre a
 * prévia de cada ronda.
 *
 * O período padrão é o mês corrente, o mesmo do servidor quando ele não recebe
 * datas. A cobertura de andares não obedece ao período — andar esquecido há
 * quatro meses é problema de hoje.
 */
export default function VisualizacaoPage() {
  const ctx = useVisualizadorBuilding();
  const { user } = useAuthStore();
  const agora = new Date();
  const [year, setYear] = useState(agora.getFullYear());
  const [month, setMonth] = useState(String(agora.getMonth() + 1));

  const range = useMemo(() => {
    const { date_from, date_to } = intervaloDe({ year, month });
    return { from: date_from, to: date_to };
  }, [year, month]);

  const overview = useSupervisorOverview(ctx.supervisiona ? ctx.buildingId : null, range);
  const dados = overview.data;
  const carregando = overview.isLoading;
  const semPermissao = codigoDoErro(overview.error) === 'FORBIDDEN' || overview.error?.response?.status === 403;

  const nome = primeiroNome(user?.name);

  return (
    <VisualizadorShell
      ctx={ctx}
      title="Painel"
      subtitle={nome ? `Olá, ${nome}. Veja como andam a agenda e a equipe do prédio` : 'Como andam a agenda e a equipe do prédio'}
      actions={
        <div className="flex items-center gap-2 flex-shrink-0">
          <BotaoAjuda contexto="visualizador.calendario" compacto />
          {ctx.supervisiona && (
            <PeriodoFiltro year={year} month={month} onYear={setYear} onMonth={setMonth} />
          )}
        </div>
      }
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 32px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {ctx.supervisiona && (overview.isError ? (
          <div
            role="alert"
            style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
          >
            <div>
              <p style={{ color: T.text, fontWeight: W.strong, fontSize: 14 }}>
                {semPermissao ? 'Sua conta não supervisiona este prédio.' : 'Não foi possível carregar o painel.'}
              </p>
              <p style={{ color: T.mute, fontSize: 13, marginTop: 4 }}>
                {semPermissao ? 'Peça ao gestor para revisar seu papel em Colaboradores.' : 'Verifique a conexão e tente de novo.'}
              </p>
            </div>
            {!semPermissao && (
              <Button variant="secondary" onClick={() => overview.refetch()} style={{ padding: '8px 16px', fontSize: 13 }}>
                Tentar de novo
              </Button>
            )}
          </div>
        ) : (
          <>
            <NumerosDaAgenda
              schedules={dados?.schedules}
              loading={carregando}
              semInspetor={dados?.schedules?.without_inspector ?? dados?.without_inspector ?? 0}
            />

            {/* Uma coluna abaixo de xl: três, entre 1024 e 1280px, apertariam a
                tabela de desempenho e o calendário até ficarem ilegíveis. */}
            <div className="grid grid-cols-1 xl:grid-cols-3" style={{ gap: 20, alignItems: 'start' }}>
              <Bloco
                id="desempenho-inspetores"
                titulo="Desempenho dos inspetores"
                descricao="Vistorias enviadas no período, em quantos dias, quantos andares e quantas ocorrências registradas"
                className="anim-fade-up anim-d1 xl:col-span-2"
              >
                <DesempenhoInspetores inspectors={dados?.inspectors} loading={carregando} />
              </Bloco>

              <Bloco id="agenda-do-mes" titulo="Agenda" acao={<LinkParaAgenda />} className="anim-fade-up anim-d2">
                <CalendarioDoPainel buildingId={ctx.buildingId} />
              </Bloco>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3" style={{ gap: 20, alignItems: 'start' }}>
              <Bloco
                id="grafico-agendamentos"
                titulo="Agendamentos"
                descricao="Rondas com prazo no período: cumpridas em dia, fora do prazo e ainda abertas"
                className="anim-fade-up anim-d3"
              >
                <GraficoAgendamentos schedules={dados?.schedules} loading={carregando} />
              </Bloco>
              <Bloco
                id="chamados-status"
                titulo="Chamados por status"
                descricao="Ocorrências abertas no período, pelo estado em que estão hoje"
                className="anim-fade-up anim-d4"
              >
                <ChamadosPorStatus byStatus={dados?.tickets?.by_status} loading={carregando} />
              </Bloco>
              <Bloco
                id="cobertura-andares"
                titulo="Cobertura de andares"
                descricao="Há quanto tempo cada andar não recebe vistoria — os mais esquecidos primeiro"
                className="anim-fade-up anim-d5"
              >
                <CoberturaDeAndares coverage={dados?.coverage} loading={carregando} />
              </Bloco>
            </div>
          </>
        ))}

        <div className="anim-fade-up anim-d6">
          <InspecoesRecentes key={ctx.buildingId} buildingId={ctx.buildingId} />
        </div>
      </div>
    </VisualizadorShell>
  );
}
