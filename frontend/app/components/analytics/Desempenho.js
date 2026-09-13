'use client';
import { T } from '@/app/lib/theme';
import { ESPACO, TIPO } from './escala';
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
 * O alternador daqui é o `.seg` chapado do produto, e não a pílula dourada do
 * alternador de cima. São dois níveis de escolha — que assunto, e dentro dele
 * que equipe — e dar a mesma peça aos dois faria parecerem irmãos.
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
          <div role="group" aria-label="Equipe a analisar" className="seg">
            {EQUIPES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onTrocarEquipe(item.key)}
                aria-pressed={equipe === item.key}
                className={`seg__btn ${equipe === item.key ? 'is-on' : ''}`}
              >
                {item.rotulo}
              </button>
            ))}
          </div>

          <span style={{ ...TIPO.meta, color: T.faint }}>
            {emInspetores
              ? 'Quem encontra a ocorrência: cobertura do prédio e rigor da ronda.'
              : 'Quem resolve a ocorrência: carga, tempo de execução e prazo.'}
          </span>
        </div>
      )}

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
  );
}
