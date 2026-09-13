'use client';
import { Skeleton } from '@/app/components/ui';
import { T, W } from '@/app/lib/theme';
import { Colunas } from './Colunas';

/**
 * Onde o chamado espera, e por quanto.
 *
 * Quatro colunas, na ordem em que o chamado as atravessa: a altura é o tempo
 * médio parado ali. A pergunta é "qual etapa é a mais lenta", e topo de coluna
 * contra topo de coluna é a comparação que o olho faz sem esforço nenhum.
 *
 * A escala é o maior tempo, e não a soma. Dividir pela soma faria quatro etapas
 * parecidas ocuparem 25% cada uma, e a mais lenta — que é a única coisa que se
 * veio ver — deixaria de saltar.
 *
 * **Os nomes das etapas aparecem uma vez só.** Antes havia duas fileiras no
 * mesmo cartão: as colunas embaixo de "Triagem/Receber/Executar/Fechar", e
 * logo abaixo um bloco "Parados agora" repetindo os mesmos quatro nomes com
 * outros quatro números. Ler o cartão exigia casar as duas fileiras de cabeça.
 * Agora quantos estão parados é a terceira linha da própria coluna, junto do
 * nome que já estava ali.
 *
 * Os rótulos nomeiam a **ação que a etapa está esperando**, não o par de
 * estados: a etapa lenta passa a apontar o que não foi feito, com o dono ao
 * lado. O nome completo da transição fica no `title` e na tabela equivalente.
 *
 * O dourado aparece uma vez só na tela inteira, e é aqui: na etapa que consome
 * mais tempo.
 */

/**
 * O que cada etapa espera, e de quem.
 *
 * Rótulos curtos porque a coluna do telefone tem 70px: "Encaminhar" mede 69 na
 * fonte do produto e passaria a depender de um pixel — justamente no rótulo do
 * gargalo. "Triagem" é a palavra que o próprio produto usa para essa espera
 * (ver a mesa de triagem em ChamadosBoard).
 */
const ACOES = {
  ABERTURA: { rotulo: 'Triagem', dono: 'moderador' },
  ENCAMINHADO: { rotulo: 'Receber', dono: 'responsável' },
  RECEBIDO: { rotulo: 'Executar', dono: 'responsável' },
  CONCLUSAO_INFORMADA: { rotulo: 'Fechar', dono: 'moderador' },
};

/**
 * A unidade do gráfico inteiro, escolhida pela maior das etapas.
 *
 * Uma unidade por coluna era mentira de leitura: "2,5 dias" ao lado de "46,2 h"
 * põe o número maior embaixo da coluna menor, e quem lê os rótulos antes de
 * olhar as alturas entende o gráfico ao contrário.
 */
function escolherUnidade(maior) {
  if (maior >= 48) return { divisor: 24, sufixo: 'dias', casas: 1 };
  if (maior >= 1) return { divisor: 1, sufixo: 'h', casas: 1 };
  return { divisor: 1 / 60, sufixo: 'min', casas: 0 };
}

function duracao(horas, unidade) {
  if (horas === null || horas === undefined) return null;
  const v = horas / unidade.divisor;
  return `${v.toFixed(unidade.casas).replace('.', ',')} ${unidade.sufixo}`;
}

/**
 * A legenda que evita a confusão das duas escalas.
 *
 * O cartão mostra dois números por etapa e eles têm bases diferentes: a altura
 * é média do período escolhido, a contagem de parados é o prédio inteiro neste
 * instante. Sem uma linha dizendo isso, quem lê soma um com o outro.
 */
function ComoLer({ total, periodo }) {
  return (
    <p style={{ color: T.faint, fontSize: 10, lineHeight: 1.5 }}>
      Altura: tempo médio dos chamados abertos {periodo ? `em ${periodo.toLowerCase()}` : 'no período'}.
      {' '}
      <span style={{ color: T.mute, fontWeight: W.strong }}>
        Parados: {total} {total === 1 ? 'chamado esperando' : 'chamados esperando'} agora
      </span>
      {' '}no prédio inteiro, fora do recorte.
    </p>
  );
}

export function FunilDeEtapas({ funil, periodoLabel, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <Skeleton style={{ flex: 1, minHeight: 180 }} />
        <Skeleton style={{ height: 28 }} />
      </div>
    );
  }

  const etapas = funil?.etapas ?? [];
  if (etapas.length === 0) {
    return <p style={{ color: T.faint, fontSize: 12 }}>Sem etapas a medir neste período.</p>;
  }

  const unidade = escolherUnidade(Math.max(...etapas.map((e) => e.media_horas ?? 0), 0));
  const paradosTotal = etapas.reduce((s, e) => s + e.parados_agora, 0);

  const colunas = etapas.map((etapa, i) => {
    const acao = ACOES[etapa.de] ?? { rotulo: etapa.de, dono: '' };
    const ehGargalo = funil.gargalo === `${etapa.de}->${etapa.para}`;
    const tempo = duracao(etapa.media_horas, unidade);
    const mediana = duracao(etapa.mediana_horas, unidade);
    const parados = etapa.parados_agora;

    return {
      id: etapa.de,
      valor: etapa.media_horas,
      texto: tempo,
      rotulo: acao.rotulo,
      // A granularidade grossa da primeira etapa vai escrita, e não escondida:
      // a vistoria não grava hora, então aquele número é medido em dias.
      sublinha:
        i === 0 && funil.etapa1_granularidade === 'DIA' ? 'moderador · em dias' : acao.dono,
      // A terceira linha: quantos estão parados ali agora. É o que era uma
      // fileira inteira repetindo estes mesmos quatro nomes.
      nota:
        parados === 0
          ? 'nenhum parado'
          : `${parados} ${parados === 1 ? 'parado' : 'parados'} agora`,
      destaque: ehGargalo,
      rotuloCompleto: `${etapa.rotulo}${mediana ? ` (mediana ${mediana})` : ''}${ehGargalo ? ' — gargalo do período' : ''}`,
    };
  });

  const gargalo = colunas.find((c) => c.destaque);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      {/* A conclusão vem antes do gráfico, e não depois dele.
          O cartão existe para responder "onde trava"; escrever a resposta em
          uma linha poupa quem só passou os olhos, e o gráfico fica para quem
          quer conferir de quanto é a diferença. */}
      {gargalo && (
        <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.5 }}>
          A espera mais longa é para{' '}
          <span style={{ color: T.text, fontWeight: W.title }}>{gargalo.rotulo.toLowerCase()}</span>
          , com{' '}
          <span style={{ color: T.text, fontWeight: W.title }}>{gargalo.texto}</span> em média —
          responsabilidade do {gargalo.sublinha.split(' · ')[0]}.
        </p>
      )}

      <Colunas
        itens={colunas}
        medida="Tempo médio parado"
        vazio="Nenhum chamado deste período andou entre as etapas, então não há tempo a medir."
      />

      <ComoLer total={paradosTotal} periodo={periodoLabel} />
    </div>
  );
}
