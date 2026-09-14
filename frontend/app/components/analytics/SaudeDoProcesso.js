'use client';
import { AlertTriangle, Clock, CornerUpLeft, Scale, Send, Wallet } from 'lucide-react';
import { Skeleton } from '@/app/components/ui';
import { T, W } from '@/app/lib/theme';
import { Celula } from './CartaoMetrica';
import { TIPO } from './escala';

/**
 * Os desvios do processo — o que o tempo de cada etapa não conta.
 *
 * O funil mostra onde o chamado espera. Ele não mostra se a fila está
 * crescendo, se o processo está sendo pulado, nem se o que foi registrado vale
 * alguma coisa. Cada número aqui existe porque muda uma decisão — e os que não
 * mudariam ficaram de fora.
 *
 * **Tudo aqui é do período**, e isso é novo. O cartão tinha um quarto grupo — a
 * fila de hoje — que lia o relógio de agora, com uma etiqueta no cabeçalho
 * avisando. A etiqueta avisava; a tela continuava pondo um estoque ao lado de
 * um fluxo, e quem lê de relance soma os dois. O grupo subiu para o bloco "A
 * fila hoje", na seção "Agora", onde ele está entre os pares dele.
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

  // `fila_hoje` saiu daqui para o bloco "A fila hoje", no topo da tela.
  //
  // Ela era o único grupo deste cartão que lia o relógio de agora; os outros
  // três são do período. Um cartão com dois relógios dentro é onde o leitor
  // começa a somar um estoque com um fluxo sem perceber — e a etiqueta que
  // avisava disso vivia no cabeçalho do grupo, longe dos números. Agora a
  // divisão é estrutural: o que é de agora está numa seção, o que é do período
  // está em outra.
  const { balanco, desvios, registro } = processo;
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
  // A fila crescer dois num ano não é notícia; crescer um quarto do que entrou é.
  const filaCrescendo = cresceu && balanco.saldo / Math.max(balanco.nasceram, 1) >= 0.25;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Grupo titulo="Balanço da fila" base={`entradas e saídas em ${label}`} primeiro>
        <Celula
          icone={Scale}
          rotulo="Saldo do período"
          valor={`${balanco.saldo > 0 ? '+' : ''}${numero(balanco.saldo)}`}
          alerta={filaCrescendo}
          nota={
            balanco.saldo === 0
              ? 'Entrou o mesmo que saiu. A fila ficou do mesmo tamanho.'
              : cresceu
                ? `Entraram ${numero(balanco.nasceram)} e saíram ${numero(balanco.fecharam)}. A fila cresceu.`
                : `Saíram ${numero(balanco.fecharam)} e entraram ${numero(balanco.nasceram)}. A fila encolheu.`
          }
        />
        <Celula
          icone={Send}
          rotulo="Abertos"
          valor={numero(balanco.nasceram)}
          nota={`Ocorrências que a vistoria abriu em ${label}.`}
        />
        <Celula
          icone={Clock}
          rotulo="Fechados"
          valor={numero(balanco.fecharam)}
          nota={`Chamados que o moderador encerrou em ${label}, de qualquer mês de abertura.`}
        />
      </Grupo>

      <Grupo titulo="Desvios do processo" base={`em ${label}`}>
        <Celula
          icone={CornerUpLeft}
          rotulo="Voltaram etapa"
          valor={numero(desvios.com_volta)}
          alerta={relevante(desvios.com_volta)}
          nota={
            desvios.com_volta === 0
              ? 'Nenhum encaminhamento cancelado nem conclusão desfeita.'
              : 'Tiveram o encaminhamento cancelado ou a conclusão desfeita.'
          }
        />
        <Celula
          icone={Send}
          rotulo="Reencaminhados"
          valor={numero(desvios.reencaminhados)}
          alerta={relevante(desvios.reencaminhados)}
          nota={
            desvios.reencaminhados === 0
              ? 'Todo chamado foi para a pessoa certa de primeira.'
              : 'Foram encaminhados mais de uma vez — a triagem errou o alvo.'
          }
        />
        <Celula
          icone={AlertTriangle}
          rotulo="Fechados sem responsável"
          valor={numero(desvios.fechados_sem_responsavel)}
          nota={
            desvios.fechados_sem_responsavel === 0
              ? 'Todo chamado fechado passou por quem executa.'
              : 'Foram encerrados sem ninguém receber: o moderador resolveu direto, ou fechou sem execução.'
          }
        />
      </Grupo>

      <Grupo titulo="Qualidade do registro" base={`em ${label}`}>
        <Celula
          icone={Wallet}
          rotulo="Concluídos com valor"
          valor={registro.pct_com_custo === null ? '—' : `${numero(registro.pct_com_custo)}%`}
          alerta={registro.pct_com_custo !== null && registro.pct_com_custo < 50}
          nota={
            registro.pct_com_custo === null
              ? 'Nada concluído no período.'
              : `${numero(registro.concluidos_com_custo)} de ${numero(balanco.fecharam)} tiveram o valor preenchido. Abaixo disso, o custo do prédio é chute.`
          }
        />
        <Celula
          icone={AlertTriangle}
          rotulo="Abertos como alta"
          valor={registro.pct_altas === null ? '—' : `${numero(registro.pct_altas)}%`}
          nota={
            registro.pct_altas === null
              ? 'Nada aberto no período.'
              : `${numero(registro.altas)} dos ${numero(balanco.nasceram)} abertos vieram como prioridade alta.`
          }
        />
      </Grupo>
    </div>
  );
}
