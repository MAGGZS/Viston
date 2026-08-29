'use client';
import { Check, Moon, Sun } from 'lucide-react';
import { Modal } from '@/app/components/ui';
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
        background: T.chip, border: 'none', borderRadius: R.control, padding: 10,
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
 * Aparência.
 *
 * Sem botão de salvar: a troca acontece no toque e a tela por trás já responde,
 * então confirmar seria pedir para a pessoa aprovar o que ela acabou de ver.
 */
export function AparenciaModal({ open, onClose }) {
  const theme = useTheme();

  return (
    <Modal open={open} onClose={onClose} title="Aparência" maxWidth={440}>
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

      <p style={{ color: T.mute, fontSize: 13, marginTop: 14, lineHeight: 1.45 }}>
        A escolha vale neste aparelho. Entrando de outro, o tema começa no escuro de novo.
      </p>
    </Modal>
  );
}
