'use client';
import { Download } from 'lucide-react';
import { T, R, W } from '@/app/lib/theme';
import { baixarCsv } from '@/app/lib/csv';
import { TIPO } from './escala';

/**
 * O botão de exportar uma tabela do painel.
 *
 * Existe porque o painel responde perguntas e não produz nada que se leve para
 * fora dele. A conversa que ele começa — "estes cinco chamados estão vencidos",
 * "este andar deu problema quatro vezes" — continua numa reunião, num e-mail ao
 * síndico, numa planilha de orçamento. Até aqui, quem precisava disso copiava
 * número por número da tela.
 *
 * Só onde há linha, e não em todo bloco. Um gráfico de barras exportado vira
 * uma tabela de duas colunas que a tabela acessível do próprio bloco já tem;
 * não é exportação, é ruído com ícone. As duas superfícies que ganham arquivo
 * são as que já são lista: a fila do que pede atenção e o comparativo da
 * equipe. As duas viram trabalho fora da tela.
 *
 * Discreto de propósito — ícone e rótulo em `meta`, sem fundo. Ele acompanha um
 * cabeçalho de bloco, e um botão de peso ali competiria com o número que o
 * bloco existe para mostrar.
 */
export function BaixarCsv({ nome, colunas, linhas, rotulo = 'CSV' }) {
  const vazio = !linhas || linhas.length === 0;

  return (
    <button
      type="button"
      onClick={() => baixarCsv(nome, colunas, linhas)}
      disabled={vazio}
      className="btn press"
      title={vazio ? 'Nada a exportar neste recorte' : `Baixar ${linhas.length} linhas em CSV`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 8px', borderRadius: R.badge,
        background: 'transparent', border: 'none',
        ...TIPO.meta,
        color: vazio ? T.faint : T.mute,
        fontWeight: W.strong,
        cursor: vazio ? 'default' : 'pointer',
        opacity: vazio ? 0.5 : 1,
      }}
    >
      <Download size={12} aria-hidden="true" />
      {rotulo}
    </button>
  );
}
