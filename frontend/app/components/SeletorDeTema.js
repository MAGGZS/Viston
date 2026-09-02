'use client';
import { Check, Moon, Sun } from 'lucide-react';
import { setTheme, useTheme } from '@/app/lib/tema';
import { T, R, W } from '@/app/lib/theme';

/**
 * As cores das miniaturas são literais de propósito, e é a única parte do
 * produto onde isso está certo.
 *
 * Cada prévia mostra o tema que ela oferece, não o tema em uso: a do claro
 * precisa ser clara enquanto o app está escuro, senão as duas opções ficam
 * idênticas e a escolha vira adivinhação. Token aqui faria as duas mudarem
 * juntas. Se algum valor mudar em globals.css, mude aqui também.
 */
const PREVIEW = {
  dark: { page: '#0B0B0B', card: '#171717', ring: 'transparent', line: 'rgba(255,255,255,0.22)' },
  light: { page: '#F5F6F8', card: '#FFFFFF', ring: 'rgba(16,19,23,0.10)', line: 'rgba(16,19,23,0.22)' },
};

/** Miniatura da interface: a página, um cartão e a pílula dourada da ação. */
function Preview({ tone }) {
  const c = PREVIEW[tone];

  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block', height: 76, borderRadius: R.pill, padding: 9,
        background: c.page, boxShadow: `inset 0 0 0 1px ${c.ring}`,
      }}
    >
      <span style={{ display: 'block', width: '46%', height: 5, borderRadius: 3, background: c.line, marginBottom: 8 }} />
      <span
        style={{
          display: 'block', height: 40, borderRadius: 9, padding: 8,
          background: c.card, boxShadow: `inset 0 0 0 1px ${c.ring}`,
        }}
      >
        <span style={{ display: 'block', width: 26, height: 6, borderRadius: 999, background: '#F5C518', marginBottom: 6 }} />
        <span style={{ display: 'block', width: '72%', height: 4, borderRadius: 2, background: c.line }} />
      </span>
    </span>
  );
}

function Option({ tone, label, icon: Icon, selected, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        background: T.card, border: 'none', borderRadius: R.control, padding: 10,
        cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10,
        // O fio dourado é o que diz qual está valendo; o resto da caixa é igual.
        boxShadow: selected ? `0 0 0 2px ${T.accent}` : T.cardRing,
        transition: 'box-shadow 0.15s ease',
      }}
    >
      <Preview tone={tone} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: T.text, fontSize: 14, fontWeight: W.strong }}>
        <Icon size={15} strokeWidth={1.8} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{label}</span>
        {selected && <Check size={15} strokeWidth={2.4} color={T.accentInk} />}
      </span>
    </button>
  );
}

/**
 * A escolha do tema, onde quer que ela precise aparecer.
 *
 * Morava numa caixa que abria por cima da tela. Caixa é interrupção, e trocar o
 * tema não interrompe nada: o resultado aparece atrás dela, no próprio app, e a
 * pessoa fica olhando a mudança pela fresta. Agora as duas opções ficam na
 * seção de aparência, à vista, e a tela inteira responde ao toque.
 *
 * Sem botão de salvar: a troca acontece no toque e a tela por trás já responde,
 * então confirmar seria pedir para a pessoa aprovar o que ela acabou de ver.
 *
 * O fundo das opções é `T.card` porque elas vivem dentro de um bloco de
 * `T.chip` — a miniatura precisa de uma moldura que se distinga do que está
 * atrás dela, senão as duas prévias flutuam soltas no mesmo cinza.
 */
export function SeletorDeTema() {
  const theme = useTheme();

  return (
    // A mesma medida que as opções tinham dentro da caixa: 440 de largura menos
    // os 22 de recuo de cada lado. Fora dela o painel de configurações é muito
    // mais largo, e duas miniaturas esticadas por ele viram dois retângulos
    // compridos que não se parecem mais com a tela que prometem mostrar.
    <div style={{ maxWidth: 396 }}>
      <div role="radiogroup" aria-label="Tema" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Option
          tone="dark"
          label="Escuro"
          icon={Moon}
          selected={theme === 'dark'}
          onSelect={() => setTheme('dark')}
        />
        <Option
          tone="light"
          label="Claro"
          icon={Sun}
          selected={theme === 'light'}
          onSelect={() => setTheme('light')}
        />
      </div>

      <p style={{ color: T.mute, fontSize: 13, marginTop: 12, lineHeight: 1.45 }}>
        A escolha vale neste aparelho. Entrando de outro, o tema começa no escuro de novo.
      </p>
    </div>
  );
}
