'use client';
import { T } from '@/app/lib/theme';
import { ESPACO, TIPO } from './escala';
import { SeletorInterno } from './SeletorDeVisao';
import { Inspetores } from './Inspetores';
import { Responsaveis } from './Responsaveis';

/**
 * O desempenho de quem trabalha no prédio.
 *
 * Duas equipes, dois trabalhos: quem **encontra** a ocorrência e quem a
 * **resolve**. Medi-las com as mesmas colunas seria dizer que são a mesma
 * coisa — um inspetor não tem SLA, um responsável não tem cobertura de andar —,
 * então são duas tabelas, e o que as une é a pergunta da aba, não o formato.
 *
 * **Quem vê o quê.** O moderador enxerga responsáveis: é com eles que ele
 * trabalha, é para eles que ele encaminha. Inspetores são leitura do gestor,
 * que é quem responde pelo prédio inteiro — e por isso o segundo botão nem
 * aparece para o moderador. A guarda de verdade está no servidor
 * (`requireBuildingManager` na rota); a ausência do botão é cortesia, não
 * segurança.
 *
 * O alternador daqui é o mesmo desenho do de cima, um degrau menor
 * (`SeletorInterno`). Era o `.seg` chapado do produto, escolhido quando o de
 * cima era uma pílula dourada: duas peças diferentes para não parecerem irmãos.
 *
 * A premissa caiu quando o de cima virou aba com fio. Duas formas diferentes
 * para a mesma interação, na mesma tela, a 40px de distância, não se lêem como
 * "dois níveis de escolha" — se lêem como inconsistência. A hierarquia agora
 * vem do tamanho, que é como ela se diz sem inventar um segundo vocabulário.
 *
 * O `.seg` também trazia `aria-pressed`, que anuncia botão de alternância a
 * quem ouve a tela. Isto aqui é aba, e agora diz que é.
 */

const EQUIPES = [
  { key: 'RESPONSAVEIS', rotulo: 'Responsáveis' },
  { key: 'INSPETORES', rotulo: 'Inspetores' },
];

export function Desempenho({
  equipe,
  responsaveis,
  inspetores,
  podeVerInspetores,
  onTrocarEquipe,
  onSelecionarResponsavel,
}) {
  const emInspetores = podeVerInspetores && equipe === 'INSPETORES';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.lg, flex: 1 }}>
      {podeVerInspetores && (
        <div style={{ display: 'flex', alignItems: 'center', gap: ESPACO.md, flexWrap: 'wrap' }}>
          <SeletorInterno
            views={EQUIPES}
            value={equipe}
            onSelect={onTrocarEquipe}
            label="Equipe a analisar"
          />

          <span style={{ ...TIPO.meta, color: T.faint }}>
            {emInspetores
              ? 'Quem encontra a ocorrência: cobertura do prédio e rigor da ronda.'
              : 'Quem resolve a ocorrência: carga, tempo de execução e prazo.'}
          </span>
        </div>
      )}

      {/* A troca de equipe anima; a troca de aba lá em cima já animava porque
          o cartão inteiro remonta, mas aqui a tabela era substituída dentro do
          mesmo cartão e o conteúdo pulava sem aviso. Duas tabelas de colunas
          diferentes trocando no mesmo quadro se leem como a página tendo dado
          um erro.

          `key` na visão: é o que faz o navegador tratar a tabela nova como
          elemento novo e tocar a entrada de novo. Sem ela o React reaproveita o
          nó e a animação não roda uma segunda vez.

          Mais rápido que a entrada de um bloco — 180ms contra 220 — porque aqui
          já se está dentro do assunto: o cartão, o título e o alternador não se
          moveram, e só o miolo mudou. */}
      <div
        key={emInspetores ? 'INSPETORES' : 'RESPONSAVEIS'}
        style={{
          animation: 'analise-entra 180ms var(--ease-saida) both',
          flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
        }}
      >
        {emInspetores ? (
          <Inspetores dados={inspetores?.data} loading={inspetores?.isLoading} />
        ) : (
          <Responsaveis
            dados={responsaveis?.data}
            loading={responsaveis?.isLoading}
            onSelecionar={onSelecionarResponsavel}
          />
        )}
      </div>
    </div>
  );
}
