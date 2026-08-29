'use client';
import { useMemo, useState } from 'react';
import { ChipSelect } from '@/app/components/ChipSelect';
import { ATE_HOJE, intervaloDe } from '@/app/lib/periodo';

/**
 * O recorte de tempo dos gráficos do painel: um ano e, dentro dele, um mês.
 *
 * O padrão é "Até hoje", e ele não é um atalho para "o ano inteiro": vai do
 * primeiro de janeiro do ano escolhido até o dia em que a pessoa está olhando.
 * A diferença aparece no ano corrente, onde somar dezembro adiantaria meses que
 * ainda não aconteceram — e é justamente o ano que o painel abre.
 *
 * Dois chips, e não um só com "Agosto de 2026" dentro: quem administra prédio
 * compara o mesmo mês de dois anos, e com um chip só isso é reabrir a lista
 * inteira a cada troca.
 */

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Cinco anos para trás cobrem o histórico de um prédio sem virar lista que se rola. */
const ANOS_ATRAS = 5;

/**
 * A escolha e o intervalo que ela vira.
 *
 * Cada cartão tem o seu: são duas perguntas diferentes sobre o mesmo prédio, e
 * amarrá-las obrigaria quem quer ver o ano inteiro num gráfico e um mês no
 * outro a escolher qual dos dois responder.
 */
export function usePeriodo() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(ATE_HOJE);

  // A data de hoje entra na conta uma vez por render do cartão, e não a cada
  // consulta: `intervaloDe` devolveria uma chave nova a cada milissegundo, e a
  // consulta recomeçaria sozinha para sempre.
  const params = useMemo(() => intervaloDe({ year, month }), [year, month]);

  return { year, setYear, month, setMonth, params };
}

export function PeriodoFiltro({ year, month, onYear, onMonth, style = {} }) {
  const anos = useMemo(() => {
    const atual = new Date().getFullYear();
    return Array.from({ length: ANOS_ATRAS + 1 }, (_, i) => String(atual - i));
  }, []);

  return (
    <div
      role="group"
      aria-label="Período do gráfico"
      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', ...style }}
    >
      {/* Sem "todos os anos": o gráfico é sempre de um período, e o mais largo
          que ele oferece é o ano corrente inteiro até hoje. Acende só quando o
          ano não é o corrente — o padrão aceso não diria nada. */}
      <ChipSelect
        label="Ano"
        options={anos.map((a) => ({ value: a, label: a }))}
        value={String(year)}
        onChange={(v) => onYear(Number(v))}
        ativo={String(year) !== anos[0]}
        minWidth={88}
      />
      {/* "Até hoje" entra como opção, e não como o "todos" do chip: aqui o
          vazio não é ausência de recorte, é um recorte com nome — e o cartão
          tem de dizer que período está mostrando. */}
      <ChipSelect
        label="Mês"
        options={[
          { value: ATE_HOJE, label: 'Até hoje' },
          ...MESES.map((m, i) => ({ value: String(i + 1), label: m })),
        ]}
        value={month}
        onChange={onMonth}
        minWidth={104}
      />
    </div>
  );
}
