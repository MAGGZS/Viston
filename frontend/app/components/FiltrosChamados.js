'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { ChipSelect, chipBase, CHIP_PAD } from '@/app/components/ChipSelect';
import { useBuildingResponsibles, useFloors } from '@/app/hooks/useApi';
import { sortFloorsDesc } from '@/app/lib/floorOrder';
import { CATEGORIES, MAINTENANCE_TYPES, PRIORITIES } from '@/app/lib/maintenanceOptions';
import { T } from '@/app/lib/theme';

/**
 * Os filtros da lista de finalizados, em fileira sobre ela.
 *
 * Aqui eles ficam à vista, e não atrás de um ícone como no histórico ampliado.
 * A diferença é o lugar: lá o miolo mora numa caixa, onde cada droplist é uma
 * linha a menos de lista; esta é uma tela inteira, com o cabeçalho já ocupando
 * a faixa de cima, e a fileira cabe nela sem empurrar nada. Filtro visível é o
 * que evita a lista voltar curta sem que nada na tela explique por quê.
 *
 * Cada recorte é um chip (ver ChipSelect): apagado com o nome do campo
 * enquanto ninguém escolheu nada, aceso no dourado com o valor depois. É o que
 * diferencia "nenhum andar" de um andar escolhido sem obrigar a ler os sete de
 * uma vez.
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
  sort: '',
};

/**
 * A ordem da lista.
 *
 * O vazio aqui não é ausência de filtro: é a ordem padrão, e ela tem nome. Por
 * isso a opção entra direto em `options` com valor `''` — o chip a mostra no
 * gatilho, e quem olha a fileira sabe em que ordem está lendo sem tocar em
 * nada. (Ver a nota sobre `todos` no `ChipSelect`.)
 *
 * As duas pontas de "Fechado em", que é a coluna que esta lista mostra e a
 * única data que todas as linhas daqui têm.
 */
export const ORDENS_FINALIZADOS = [
  { value: '', label: 'Fechado recentemente' },
  { value: 'CLOSED_ASC', label: 'Fechado há mais tempo' },
];

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
      <ChipSelect label="Andar" todos="Todos os andares" options={andares}
        value={filtros.floor_id} onChange={(v) => set('floor_id', v)} />
      <ChipSelect label="Tipo" todos="Todos os tipos" options={MAINTENANCE_TYPES}
        value={filtros.maintenance_type} onChange={(v) => set('maintenance_type', v)} />
      <ChipSelect label="Categoria" todos="Todas as categorias" options={CATEGORIES}
        value={filtros.category} onChange={(v) => set('category', v)} />
      <ChipSelect label="Prioridade" todos="Todas as prioridades" options={PRIORITIES}
        value={filtros.priority} onChange={(v) => set('priority', v)} />
      <ChipSelect label="Responsável" todos="Todos os responsáveis"
        options={responsaveis.map((r) => ({ value: r.id, label: r.name }))}
        value={filtros.responsible_id} onChange={(v) => set('responsible_id', v)} />

      <DataChip label="De" value={filtros.date_from} onChange={(v) => set('date_from', v)} />
      <DataChip label="Até" value={filtros.date_to} onChange={(v) => set('date_to', v)} />

      {/* A ordem fecha a fileira, depois dos recortes: primeiro se decide o que
          entra na lista, e só então em que ordem se lê o que sobrou. Acende só
          quando sai do padrão, como o chip de período — nascer dourado faria o
          dourado deixar de querer dizer "mexi nisto". */}
      <ChipSelect label="Ordem" options={ORDENS_FINALIZADOS}
        value={filtros.sort} onChange={(v) => set('sort', v)}
        ativo={filtros.sort !== ''} />

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
