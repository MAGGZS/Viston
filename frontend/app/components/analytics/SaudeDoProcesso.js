'use client';
import { AlertTriangle, Clock, CornerUpLeft, Hourglass, Scale, Send, Wallet } from 'lucide-react';
import { Skeleton } from '@/app/components/ui';
import { T, W } from '@/app/lib/theme';

/**
 * O que o tempo de cada etapa não conta.
 *
 * O funil mostra onde o chamado espera. Ele não mostra se a fila está
 * crescendo, se há coisa apodrecendo no fundo dela, se alguém foi esquecido, ou
 * se o processo está sendo pulado. Cada número aqui existe porque muda uma
 * decisão — e os que não mudariam ficaram de fora.
 *
 * As três leituras têm bases diferentes, e isso vai escrito em cada bloco em
 * vez de ficar implícito: o balanço é do período, a fila é de hoje (prédio
 * inteiro), os desvios são do período. Sem dizer, quem lê soma um com o outro.
 */

function numero(v, casas = 0) {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

const dias = (n) => (n === 1 ? '1 dia útil' : `${numero(n)} dias úteis`);

/**
 * Um número com o que ele quer dizer embaixo.
 *
 * Não é o `StatCard` do produto: aquele é um cartão com fundo próprio, e uma
 * fileira de sete deles aqui dentro seria cartão dentro de cartão. Aqui são
 * células de uma grade, separadas por linha fina — o mesmo peso visual de uma
 * tabela, que é o que sete números comparáveis pedem.
 *
 * `alerta` é o que decide a cor. Só quem pede ação recebe tinta; o resto fica na
 * cor do texto. Nenhum deles depende da cor: a leitura vem escrita embaixo.
 */
function Celula({ icon: Icon, rotulo, valor, leitura, alerta = false, sufixo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          color: T.faint, fontSize: 10, fontWeight: W.strong,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}
      >
        <Icon size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
        {rotulo}
      </span>

      <span
        style={{
          fontFamily: T.display, fontSize: 22, fontWeight: W.title, lineHeight: 1.1,
          color: alerta ? T.danger : T.text,
        }}
      >
        {valor}
        {sufixo && (
          <span style={{ fontSize: 12, fontWeight: W.body, color: T.faint }}> {sufixo}</span>
        )}
      </span>

      {/* O número recebe a cor; a explicação não.
          Pintar as duas coisas dobra a área vermelha de cada célula, e numa
          grade de onze isso vira uma tela inteira em alarme — onde tudo alarma,
          nada alarma. O ícone fica na explicação para o aviso não depender da
          cor, e a frase segue na tinta de sempre. */}
      <span style={{ color: T.faint, fontSize: 11, lineHeight: 1.45 }}>
        {alerta && (
          <AlertTriangle
            size={11}
            aria-hidden="true"
            style={{ marginRight: 4, verticalAlign: -1, color: T.danger }}
          />
        )}
        {leitura}
      </span>
    </div>
  );
}

/** Um grupo de células, com o nome da base de tempo que vale para elas. */
function Grupo({ titulo, base, children, primeiro = false }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        ...(primeiro ? {} : { borderTop: `1px solid ${T.line}`, paddingTop: 16 }),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            color: T.mute, fontSize: 10, fontWeight: W.strong,
            letterSpacing: '0.14em', textTransform: 'uppercase',
          }}
        >
          {titulo}
        </span>
        <span style={{ color: T.faint, fontSize: 10 }}>{base}</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '16px 20px',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function SaudeDoProcesso({ processo, periodo, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} style={{ height: 88 }} />
        ))}
      </div>
    );
  }

  if (!processo) return null;

  const { balanco, fila_hoje: fila, desvios, registro } = processo;
  const label = periodo?.label?.toLowerCase() ?? 'no período';
  const cresceu = balanco.saldo > 0;

  /**
   * Quando um número vira alarme.
   *
   * Nenhum destes é "maior que zero". Uma volta de etapa em cinquenta chamados
   * é ruído; quatro em onze é um processo com problema. O limiar proporcional é
   * o que impede a tela de acender tudo num prédio movimentado e nada num
   * parado — e é o que mantém o vermelho querendo dizer alguma coisa.
   */
  const relevante = (n) => balanco.nasceram > 0 && n / balanco.nasceram >= 0.1;
  // Aberto há mais que o prazo mais longo do SLA (baixa, 15 dias úteis) é um
  // chamado que nenhuma prioridade justifica.
  const velhoDemais = fila.mais_velho_dias_uteis !== null && fila.mais_velho_dias_uteis > 15;
  // A fila crescer dois num ano não é notícia; crescer um quarto do que entrou é.
  const filaCrescendo = cresceu && balanco.saldo / Math.max(balanco.nasceram, 1) >= 0.25;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Grupo titulo="Balanço da fila" base={`entradas e saídas em ${label}`} primeiro>
        <Celula
          icon={Scale}
          rotulo="Saldo do período"
          valor={`${balanco.saldo > 0 ? '+' : ''}${numero(balanco.saldo)}`}
          alerta={filaCrescendo}
          leitura={
            balanco.saldo === 0
              ? 'Entrou o mesmo que saiu. A fila ficou do mesmo tamanho.'
              : cresceu
                ? `Entraram ${numero(balanco.nasceram)} e saíram ${numero(balanco.fecharam)}. A fila cresceu.`
                : `Saíram ${numero(balanco.fecharam)} e entraram ${numero(balanco.nasceram)}. A fila encolheu.`
          }
        />
        <Celula
          icon={Send}
          rotulo="Abertos"
          valor={numero(balanco.nasceram)}
          leitura={`Ocorrências que a vistoria abriu em ${label}.`}
        />
        <Celula
          icon={Clock}
          rotulo="Fechados"
          valor={numero(balanco.fecharam)}
          leitura={`Chamados que o moderador encerrou em ${label}, de qualquer mês de abertura.`}
        />
      </Grupo>

      <Grupo titulo="A fila hoje" base="prédio inteiro, agora — fora do recorte de período">
        <Celula
          icon={Hourglass}
          rotulo="Em aberto"
          valor={numero(fila.em_aberto)}
          leitura={
            fila.mediana_dias_uteis === null
              ? 'Nada em aberto no prédio.'
              : `Metade deles espera há mais de ${dias(Math.round(fila.mediana_dias_uteis))}.`
          }
        />
        <Celula
          icon={Clock}
          rotulo="O mais antigo"
          valor={fila.mais_velho_dias_uteis === null ? '—' : numero(fila.mais_velho_dias_uteis)}
          sufixo={fila.mais_velho_dias_uteis === null ? undefined : 'dias úteis'}
          alerta={velhoDemais}
          leitura={
            fila.mais_velho_dias_uteis === null
              ? 'Sem chamado aberto para envelhecer.'
              : 'Tempo que o chamado aberto há mais tempo já esperou.'
          }
        />
        <Celula
          icon={AlertTriangle}
          rotulo="Sem movimento"
          valor={numero(fila.sem_movimento)}
          alerta={fila.sem_movimento > 0}
          leitura={
            fila.sem_movimento === 0
              ? `Todo chamado aberto teve algum toque nos últimos ${dias(fila.sem_movimento_desde_dias)}.`
              : `Sem encaminhamento, recebimento, conclusão ou linha na timeline há ${dias(fila.sem_movimento_desde_dias)} ou mais.`
          }
        />
      </Grupo>

      <Grupo titulo="Desvios do processo" base={`em ${label}`}>
        <Celula
          icon={CornerUpLeft}
          rotulo="Voltaram etapa"
          valor={numero(desvios.com_volta)}
          alerta={relevante(desvios.com_volta)}
          leitura={
            desvios.com_volta === 0
              ? 'Nenhum encaminhamento cancelado nem conclusão desfeita.'
              : 'Tiveram o encaminhamento cancelado ou a conclusão desfeita.'
          }
        />
        <Celula
          icon={Send}
          rotulo="Reencaminhados"
          valor={numero(desvios.reencaminhados)}
          alerta={relevante(desvios.reencaminhados)}
          leitura={
            desvios.reencaminhados === 0
              ? 'Todo chamado foi para a pessoa certa de primeira.'
              : 'Foram encaminhados mais de uma vez — a triagem errou o alvo.'
          }
        />
        <Celula
          icon={AlertTriangle}
          rotulo="Fechados sem responsável"
          valor={numero(desvios.fechados_sem_responsavel)}
          leitura={
            desvios.fechados_sem_responsavel === 0
              ? 'Todo chamado fechado passou por quem executa.'
              : 'Foram encerrados sem ninguém receber: o moderador resolveu direto, ou fechou sem execução.'
          }
        />
      </Grupo>

      <Grupo titulo="Qualidade do registro" base={`em ${label}`}>
        <Celula
          icon={Wallet}
          rotulo="Concluídos com valor"
          valor={registro.pct_com_custo === null ? '—' : `${numero(registro.pct_com_custo)}%`}
          alerta={registro.pct_com_custo !== null && registro.pct_com_custo < 50}
          leitura={
            registro.pct_com_custo === null
              ? 'Nada concluído no período.'
              : `${numero(registro.concluidos_com_custo)} de ${numero(balanco.fecharam)} tiveram o valor preenchido. Abaixo disso, o custo do prédio é chute.`
          }
        />
        <Celula
          icon={AlertTriangle}
          rotulo="Abertos como alta"
          valor={registro.pct_altas === null ? '—' : `${numero(registro.pct_altas)}%`}
          leitura={
            registro.pct_altas === null
              ? 'Nada aberto no período.'
              : `${numero(registro.altas)} dos ${numero(balanco.nasceram)} abertos vieram como prioridade alta.`
          }
        />
      </Grupo>
    </div>
  );
}
