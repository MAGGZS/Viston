'use client';
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { ChipSelect } from '@/app/components/ChipSelect';
import { CATEGORIES } from '@/app/lib/maintenanceOptions';
import { TIPO } from './escala';
import { T, R, W } from '@/app/lib/theme';

/**
 * O recorte do painel — e o endereço da tela.
 *
 * Aqui o filtro mora na URL, e não num `useState`. O painel é a tela que se
 * manda para alguém: "olha o mês passado do 4º andar" é um link, e um estado
 * guardado só em memória transforma isso em cinco cliques de instrução. De
 * quebra, recarregar a página deixa de jogar a pessoa de volta ao mês corrente.
 *
 * O período difere do dos cartões do painel inicial de propósito. Lá o padrão é
 * "Até hoje", que vai de 1º de janeiro ao dia em que se olha; aqui é o ano
 * inteiro, porque este painel compara cada número com o período anterior — e
 * comparar onze meses e meio com doze meses cheios é a comparação dizer que o
 * ano piorou quando o que faltou foi o ano acabar.
 */

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Cinco anos para trás cobrem o histórico de um prédio sem virar lista que se rola. */
const ANOS_ATRAS = 5;

/** O valor que significa "sem recorte" nos chips que aceitam ausência. */
const TODOS = '';

/**
 * As visões que a URL aceita, tirando a primeira.
 *
 * A primeira não entra porque ela é a ausência do parâmetro — `trocar` apaga a
 * chave quando a visão é a de entrada, para não poluir o endereço com o estado
 * padrão. Qualquer outro valor cai nela.
 */
const VISOES_VALIDAS = new Set(['DESEMPENHO', 'PREDIO']);

/**
 * Os filtros lidos do endereço, já no formato que a consulta pede.
 *
 * Devolve dois objetos separados porque eles têm donos diferentes: `filtros` é
 * o que vai ao servidor e entra na chave do cache, `estado` é o que os chips
 * desenham. Mandar `month: ''` ao servidor seria mandar um mês chamado vazio.
 */
export function useFiltrosDoPainel() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const anoCorrente = new Date().getFullYear();

  const estado = useMemo(
    () => ({
      ano: Number(params.get('ano')) || anoCorrente,
      mes: params.get('mes') ?? TODOS,
      responsavel: params.get('resp') ?? TODOS,
      andar: params.get('andar') ?? TODOS,
      categoria: params.get('cat') ?? TODOS,
      // A visão aberta também é endereço: mandar "olha a equipe em março" tem
      // de abrir na equipe, e não no processo com um clique de instrução junto.
      // Ausente é a primeira, que é onde se entra.
      // A lista de visões vive no `PainelAnalitico`; aqui só se confere que o
      // valor da URL é uma delas. Um `visao=qualquercoisa` digitado à mão cai
      // na primeira, que é onde se entra.
      visao: VISOES_VALIDAS.has(params.get('visao')) ? params.get('visao') : 'PROCESSOS',
      // E, dentro do desempenho, qual equipe. Mesma regra.
      equipe: params.get('equipe') === 'INSPETORES' ? 'INSPETORES' : 'RESPONSAVEIS',
      /**
       * Qual lista da fila acionável está aberta.
       *
       * Endereço, como as outras: "olha os parados" tem de ser um link. Sem
       * valor não vira `ATRASADOS` por padrão — quem decide é a própria fila,
       * que abre na lista mais grave *que tem conteúdo*. Fixar o padrão aqui
       * abriria em "atrasados" num prédio sem nenhum atrasado, e a tela pediria
       * um clique só para dizer que está tudo bem.
       */
      motivo: params.get('motivo') ?? TODOS,
    }),
    [params, anoCorrente]
  );

  /**
   * O recorte que vale para o prédio: tempo, andar e categoria.
   *
   * O responsável ficou de fora de propósito. Ele é um recorte sobre *gente*, e
   * gente só é assunto na aba de desempenho — aplicá-lo aos processos faria o
   * funil e o SLA mostrarem o prédio de uma pessoa só, com o chip que explica
   * isso escondido numa aba que não está aberta. Filtro que muda os números sem
   * aparecer na tela é a pior espécie de filtro.
   */
  const filtros = useMemo(
    () => ({
      year: estado.ano,
      ...(estado.mes && { month: Number(estado.mes) }),
      ...(estado.andar && { floor_id: estado.andar }),
      ...(estado.categoria && { category: estado.categoria }),
    }),
    [estado]
  );

  /** O mesmo recorte, mais a pessoa — só a aba de desempenho o usa. */
  const filtrosDeEquipe = useMemo(
    () => ({ ...filtros, ...(estado.responsavel && { responsible_id: estado.responsavel }) }),
    [filtros, estado.responsavel]
  );

  /**
   * Troca um filtro sem perder os outros.
   *
   * `replace` e não `push`: trocar de mês seis vezes e apertar "voltar" tem de
   * sair do painel, e não desfazer as seis trocas uma a uma.
   */
  const trocar = useCallback(
    (chave, valor) => {
      const busca = new URLSearchParams(params.toString());
      if (valor === TODOS || valor === null) busca.delete(chave);
      else busca.set(chave, String(valor));

      const query = busca.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  const limpar = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  return { estado, filtros, filtrosDeEquipe, trocar, limpar };
}

/**
 * Os filtros ligados, em palavras — o que a tela está mostrando agora.
 *
 * Lista só o que a aba aberta de fato aplica. Anunciar "Filtrado por Marina"
 * numa tela que ignora a Marina seria a linha de resumo mentindo sobre os
 * números logo abaixo dela.
 */
function Ativos({ estado, responsaveis, andares, mostrarResponsavel, onLimpar }) {
  const partes = [
    mostrarResponsavel &&
      estado.responsavel &&
      responsaveis?.find((r) => r.id === estado.responsavel)?.name,
    estado.andar && andares?.find((a) => a.id === estado.andar)?.label,
    estado.categoria && CATEGORIES.find((c) => c.value === estado.categoria)?.label,
  ].filter(Boolean);

  if (partes.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <p style={{ ...TIPO.meta, color: T.mute }}>
        Filtrado por {partes.join(' · ')}
      </p>
      <button
        type="button"
        onClick={onLimpar}
        className="btn"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'transparent', border: 'none', cursor: 'pointer',
          ...TIPO.meta, color: T.faint, fontWeight: W.strong,
          borderRadius: R.badge, padding: '2px 6px',
        }}
      >
        <X size={12} aria-hidden="true" />
        Limpar filtros
      </button>
    </div>
  );
}

export function FiltrosDoPainel({
  estado,
  trocar,
  limpar,
  responsaveis = [],
  andares = [],
  /** O chip de responsável só existe onde ele é aplicado: a aba de desempenho. */
  mostrarResponsavel = false,
}) {
  const anos = useMemo(() => {
    const atual = new Date().getFullYear();
    return Array.from({ length: ANOS_ATRAS + 1 }, (_, i) => String(atual - i));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        role="group"
        aria-label="Recorte do painel"
        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
      >
        <ChipSelect
          label="Ano"
          options={anos.map((a) => ({ value: a, label: a }))}
          value={String(estado.ano)}
          onChange={(v) => trocar('ano', v)}
          ativo={String(estado.ano) !== anos[0]}
          minWidth={88}
        />
        <ChipSelect
          label="Mês"
          options={[
            { value: TODOS, label: 'Ano inteiro' },
            ...MESES.map((m, i) => ({ value: String(i + 1), label: m })),
          ]}
          value={estado.mes}
          onChange={(v) => trocar('mes', v)}
          minWidth={104}
        />

        {/* Um traço entre o tempo e o resto: são duas perguntas diferentes, e a
            fileira corrida fazia "Abril" e "Marina" parecerem o mesmo tipo de
            recorte. */}
        <span aria-hidden="true" style={{ width: 1, height: 18, background: T.line, margin: '0 2px' }} />

        {mostrarResponsavel && (
          <ChipSelect
            label="Responsável"
            options={[
              { value: TODOS, label: 'Todos' },
              ...responsaveis.map((r) => ({ value: r.id, label: r.name })),
            ]}
            value={estado.responsavel}
            onChange={(v) => trocar('resp', v)}
          />
        )}
        <ChipSelect
          label="Andar"
          options={[
            { value: TODOS, label: 'Todos' },
            ...andares.map((a) => ({ value: a.id, label: a.label })),
          ]}
          value={estado.andar}
          onChange={(v) => trocar('andar', v)}
        />
        <ChipSelect
          label="Categoria"
          options={[{ value: TODOS, label: 'Todas' }, ...CATEGORIES]}
          value={estado.categoria}
          onChange={(v) => trocar('cat', v)}
        />
      </div>

      <Ativos
        estado={estado}
        responsaveis={responsaveis}
        andares={andares}
        mostrarResponsavel={mostrarResponsavel}
        onLimpar={limpar}
      />
    </div>
  );
}
