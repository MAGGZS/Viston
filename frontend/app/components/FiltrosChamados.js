'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { Select } from '@/app/components/ui';
import { useBuildingResponsibles, useFloors } from '@/app/hooks/useApi';
import { sortFloorsDesc } from '@/app/lib/floorOrder';
import { CATEGORIES, MAINTENANCE_TYPES, PRIORITIES } from '@/app/lib/maintenanceOptions';
import { T, R } from '@/app/lib/theme';

/**
 * Os filtros da lista de finalizados, em fileira sobre ela.
 *
 * Aqui eles ficam à vista, e não atrás de um ícone como no histórico ampliado.
 * A diferença é o lugar: lá o miolo mora numa caixa, onde cada droplist é uma
 * linha a menos de lista; esta é uma tela inteira, com o cabeçalho já ocupando
 * a faixa de cima, e a fileira cabe nela sem empurrar nada. Filtro visível é o
 * que evita a lista voltar curta sem que nada na tela explique por quê.
 *
 * Cada recorte é um chip — a mesma peça do "Compartilhar ID" do painel do
 * gestor, um ponto menor: fundo de chip, canto de controle, texto de 13 e o
 * nome do campo apagado enquanto ninguém escolheu nada. Sete peças em fileira
 * são muita tinta se cada uma tem o tamanho de um botão de ação, e nenhuma
 * delas é a ação da tela — a tela é a lista embaixo.
 *
 * Quando o recorte vale, o chip acende no dourado apagado e passa a mostrar o
 * que foi escolhido; é o que diferencia "nenhum andar" de um andar escolhido
 * sem obrigar a ler os sete de uma vez.
 *
 * `status` não entra: esta lista é só de concluído, e um filtro que só tem um
 * valor possível não filtra nada.
 */

/** O vazio de cada campo — e o que "Limpar" restaura. A ordem é a da fileira. */
export const FILTROS_CHAMADOS_VAZIOS = {
  floor_id: '',
  maintenance_type: '',
  category: '',
  priority: '',
  responsible_id: '',
  date_from: '',
  date_to: '',
};

/**
 * O estado dos filtros e o recorte que vai à consulta.
 *
 * `params` só carrega o que foi escolhido: campo em branco é ausência de
 * filtro, e mandá-lo vazio faria o servidor recusar o uuid que não veio. Ele
 * nasce da ordem fixa de `FILTROS_CHAMADOS_VAZIOS`, o que mantém a chave da
 * consulta estável entre renders.
 */
export function useFiltrosChamados() {
  const [filtros, setFiltros] = useState(FILTROS_CHAMADOS_VAZIOS);
  const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ''));
  return { filtros, setFiltros, params, ativos: Object.keys(params).length };
}

/**
 * A medida do chip.
 *
 * Ele se mede pelo que carrega, entre um piso e um teto. Largura fixa obrigava
 * a peça a caber "Todos os responsáveis" — a fileira inteira ficava do tamanho
 * do rótulo mais comprido, que é justamente o que ninguém está lendo. O piso
 * segura o vaivém quando se troca um valor curto por outro; o teto manda
 * "Higienização/Limpeza" terminar em reticências em vez de empurrar a fila.
 */
const CHIP_MIN_W = 108;
const CHIP_MAX_W = 190;

/**
 * A altura é a mesma nos três tipos de chip, e não sai de graça.
 *
 * O gatilho do `Select` mede 29px sozinho — é o que o recuo de 6px e uma linha
 * de 13px dão. Os outros dois não: o `<label>` do período e o botão de limpar
 * nascem com a entrelinha `normal` da fonte, que em Poppins é maior, e a
 * fileira ficava com três peças de 34px ao lado de cinco de 29. Medido no
 * navegador; 17px é a linha que iguala as três. No gatilho ele não vai — lá
 * *aumentaria* a peça para 31.
 */
const chipBase = {
  display: 'inline-flex', alignItems: 'center', flexShrink: 0,
  background: T.chip, borderRadius: R.control, fontSize: 13, lineHeight: '17px',
};

/** O recuo do chip. À direita cabe a seta do `Select`, que mora a 12px da borda. */
const CHIP_PAD = '6px 12px';
const CHIP_PAD_SETA = '6px 30px 6px 12px';

/**
 * "Não filtrar por isto" precisa ser uma opção com valor próprio.
 *
 * Se ela valesse `''` — o vazio do filtro —, o gatilho a encontraria na lista e
 * mostraria "Todos os andares" o tempo todo, e cada chip nasceria do tamanho
 * dessa frase. Com um valor que nenhuma opção usa, o vazio não casa com nada e
 * o gatilho cai no `placeholder`: o nome do campo, curto e apagado, como no
 * botão de compartilhar. A lista continua dizendo a frase inteira, que é onde
 * ela é útil.
 */
const TODOS = '__todos';

/** Uma droplist de recorte. A primeira opção é sempre "não filtrar por isto". */
function FiltroChip({ label, todos, options, value, onChange }) {
  const ativo = value !== '';

  return (
    <Select
      options={[{ value: TODOS, label: todos }, ...options]}
      value={value}
      onChange={(e) => onChange(e.target.value === TODOS ? '' : e.target.value)}
      placeholder={label}
      aria-label={label}
      wrapperStyle={{ minWidth: CHIP_MIN_W, maxWidth: CHIP_MAX_W, flexShrink: 0 }}
      // O fundo só é escrito quando o recorte vale: inline ele vence a folha de
      // estilo do `.select-trigger`, e escrevê-lo sempre custaria o realce do
      // cursor que mora lá.
      style={{
        padding: CHIP_PAD_SETA, fontSize: 13,
        ...(ativo ? { background: T.accentSoft } : {}),
      }}
    />
  );
}

/** Uma das pontas do período. As duas juntas são o intervalo. */
function DataChip({ label, value, onChange }) {
  const ativo = value !== '';

  return (
    <label
      style={{
        ...chipBase, gap: 7, padding: CHIP_PAD, cursor: 'pointer',
        ...(ativo ? { background: T.accentSoft } : {}),
      }}
    >
      <span style={{ color: ativo ? T.accentInk : T.mute, flexShrink: 0 }}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label === 'De' ? 'Fechado a partir de' : 'Fechado até'}
        // Largura natural: o campo de data é desenhado pelo navegador, e apertá-lo
        // não encolhe as caixinhas — corta a última. A 92px o Chrome mostrava
        // "dd/mm/ac" com o calendário por cima do ano.
        style={{
          width: 'auto', height: 17, padding: 0,
          background: 'none', border: 'none', outline: 'none',
          color: ativo ? T.text : T.faint, fontSize: 13, lineHeight: '17px',
          fontFamily: 'inherit', cursor: 'pointer',
        }}
      />
    </label>
  );
}

export function FiltrosChamados({ buildingId, filtros, onChange, style = {} }) {
  const { data: floorsData } = useFloors(buildingId);
  const { data: responsaveis = [] } = useBuildingResponsibles(buildingId);
  const andares = sortFloorsDesc(floorsData?.floors ?? []).map((f) => ({ value: f.id, label: f.label }));

  const set = (campo, valor) => onChange({ ...filtros, [campo]: valor });
  const ativos = Object.values(filtros).filter((v) => v !== '').length;

  return (
    <div
      role="group"
      aria-label="Filtrar os chamados finalizados"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, ...style }}
    >
      <FiltroChip label="Andar" todos="Todos os andares" options={andares}
        value={filtros.floor_id} onChange={(v) => set('floor_id', v)} />
      <FiltroChip label="Tipo" todos="Todos os tipos" options={MAINTENANCE_TYPES}
        value={filtros.maintenance_type} onChange={(v) => set('maintenance_type', v)} />
      <FiltroChip label="Categoria" todos="Todas as categorias" options={CATEGORIES}
        value={filtros.category} onChange={(v) => set('category', v)} />
      <FiltroChip label="Prioridade" todos="Todas as prioridades" options={PRIORITIES}
        value={filtros.priority} onChange={(v) => set('priority', v)} />
      <FiltroChip label="Responsável" todos="Todos os responsáveis"
        options={responsaveis.map((r) => ({ value: r.id, label: r.name }))}
        value={filtros.responsible_id} onChange={(v) => set('responsible_id', v)} />

      <DataChip label="De" value={filtros.date_from} onChange={(v) => set('date_from', v)} />
      <DataChip label="Até" value={filtros.date_to} onChange={(v) => set('date_to', v)} />

      {/* Só aparece quando há o que limpar — botão morto na fileira seria mais
          um chip a ler antes de chegar aos que fazem alguma coisa. */}
      {ativos > 0 && (
        <button
          type="button"
          onClick={() => onChange(FILTROS_CHAMADOS_VAZIOS)}
          className="anim-fade-in"
          style={{
            ...chipBase, gap: 5, padding: CHIP_PAD, border: 'none',
            color: T.accentInk, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = T.chip; }}
        >
          <X size={13} /> Limpar {ativos === 1 ? 'filtro' : 'filtros'}
        </button>
      )}
    </div>
  );
}
