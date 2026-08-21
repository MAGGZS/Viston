'use client';
import { useId } from 'react';
import { T } from '@/app/lib/theme';
import { Select } from '@/app/components/ui';

/**
 * Componentes das telas mobile.
 *
 * As cores vieram daqui originalmente e hoje valem para o produto inteiro:
 * moram em app/lib/theme.js. `M` continua exportado porque as telas mobile
 * o usam em dezenas de lugares.
 */

export const M = T;

/** Onde o "Pular para o conteúdo" (ver app/layout.js) aterrissa. */
export const CONTENT_ID = 'conteudo';

/**
 * Tela: fundo preto e espaço para a barra inferior.
 *
 * Sem `className` de propósito. As classes de animação terminam com um
 * `transform` aplicado (o `both` do fill-mode mantém o último quadro), e
 * elemento com transform vira bloco de contenção: a barra inferior, que é
 * `position: fixed`, passaria a se posicionar em relação a ele em vez da
 * janela. Quem anima aqui são os filhos.
 */
export function MPage({ children, pad = true }) {
  return (
    // `<main>` e não `<div>`: é o marco que o leitor de tela usa para pular
    // direto ao conteúdo, e é o alvo do "Pular para o conteúdo" do layout. As
    // telas do desktop já tinham o seu; o telefone é que estava sem.
    <main id={CONTENT_ID} style={{ minHeight: '100vh', background: M.bg, paddingBottom: 108 }}>
      <div style={{ padding: pad ? '0 16px' : 0 }}>{children}</div>
    </main>
  );
}

/** Barra do topo: título grande à esquerda, botões redondos à direita. */
export function MTopBar({ eyebrow, title, accent, actions, avatar, className = '' }) {
  return (
    <header className={className} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '52px 0 22px' }}>
      {avatar}
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <p style={{ color: M.faint, fontSize: 12, marginBottom: 2 }}>{eyebrow}</p>}
        <h1 style={{ fontFamily: M.display, fontWeight: 600, fontSize: 22, color: M.text, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
          {title}{accent && <span style={{ color: M.accent }}> {accent}</span>}
        </h1>
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
    </header>
  );
}

/** Botão redondo de ícone, como os do topo da referência. */
export function MRound({ children, onClick, active = false, label }) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      width: 42, height: 42, borderRadius: '50%', border: 'none', cursor: 'pointer',
      background: active ? M.accent : M.chip,
      color: active ? '#000' : M.text,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {children}
    </button>
  );
}

/**
 * Cartão base. Vira botão quando tem `onClick`.
 *
 * Uma `<div onClick>` é clicável só para quem tem mouse ou dedo: ela não recebe
 * foco, não responde a Enter nem Espaço, e o leitor de tela a lê como um
 * pedaço de texto — a pessoa passa por cima do cartão sem saber que ali havia
 * uma ação. `<button>` resolve os três de uma vez, e o `label` é o que ele
 * anuncia quando o miolo é feito de números e ícones soltos.
 */
export function MCard({ children, style = {}, onClick, className = '', label }) {
  const base = { background: M.card, borderRadius: 26, padding: 18 };

  if (!onClick) {
    return <div className={className} style={{ ...base, ...style }}>{children}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={className}
      style={{
        ...base,
        // O botão traz aparência própria do navegador: tirar é o que faz ele
        // continuar sendo o mesmo cartão.
        border: 'none', font: 'inherit', color: 'inherit', textAlign: 'left',
        width: '100%', display: 'block', cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Trio de números dentro do cartão. */
export function MStats({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 8 }}>
      {items.map(({ value, label }) => (
        <div key={label} style={{ background: M.chip, borderRadius: 16, padding: '12px 8px', textAlign: 'center' }}>
          <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 17, color: M.text, lineHeight: 1.1 }}>{value}</p>
          <p style={{ color: M.mute, fontSize: 12, marginTop: 3 }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

const BUTTON_BASE = {
  border: 'none', cursor: 'pointer', borderRadius: 16, padding: '14px 18px',
  fontFamily: M.display, fontWeight: 600, fontSize: 14,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
};

/** Ação principal: amarelo sólido. */
export function MButton({ children, onClick, type = 'button', disabled, loading, style = {} }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      style={{ ...BUTTON_BASE, background: M.accent, color: '#000', opacity: disabled || loading ? 0.5 : 1, ...style }}>
      {loading ? 'Aguarde...' : children}
    </button>
  );
}

/** Ação secundária: amarelo rebaixado. */
export function MButtonSoft({ children, onClick, type = 'button', disabled, loading, style = {} }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      style={{ ...BUTTON_BASE, background: M.accentSoft, color: M.accent, opacity: disabled || loading ? 0.5 : 1, ...style }}>
      {loading ? 'Aguarde...' : children}
    </button>
  );
}

/** Ação neutra ou destrutiva: cinza chapado. */
export function MButtonGhost({ children, onClick, type = 'button', tone = 'neutral', disabled, style = {} }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...BUTTON_BASE, background: M.chip, color: tone === 'danger' ? M.danger : M.text, opacity: disabled ? 0.5 : 1, ...style }}>
      {children}
    </button>
  );
}

/** Rótulo de seção: texto claro à esquerda, ação em pílula amarela à direita. */
export function MSectionHead({ title, action, className = '' }) {
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '26px 0 12px' }}>
      <h2 style={{ fontFamily: M.display, fontWeight: 600, fontSize: 16, color: M.text }}>{title}</h2>
      {action}
    </div>
  );
}

/** Pílula amarela usada ao lado dos títulos de seção. */
export function MPill({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: M.accent, color: '#000', border: 'none', cursor: 'pointer',
      borderRadius: 12, padding: '7px 14px', fontFamily: M.display, fontWeight: 600, fontSize: 14,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {children}
    </button>
  );
}

/**
 * Campo de texto do mobile.
 *
 * O erro é amarrado ao campo e anunciado quando aparece — ver `Input`, em
 * components/ui, para o porquê.
 */
export function MField({ label, error, style = {}, ...props }) {
  const generatedId = useId();
  const fieldId = props.id ?? props.name ?? generatedId;
  const errorId = `${fieldId}-erro`;

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {label && <span style={{ color: M.mute, fontSize: 12 }}>{label}</span>}
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{
          background: M.chip, border: `1px solid ${error ? 'rgba(248,113,113,0.5)' : 'transparent'}`,
          // 16px é o piso: abaixo disso o iOS dá zoom ao focar e a tela salta.
          borderRadius: 16, padding: '14px 16px', color: M.text, fontSize: 16, outline: 'none', width: '100%',
          ...style,
        }}
        {...props}
      />
      {error && <span id={errorId} role="alert" style={{ color: M.danger, fontSize: 12 }}>{error}</span>}
    </label>
  );
}

/**
 * Lista suspensa do formulário de vistoria.
 * Mesma lista do desktop (`Select`, em components/ui) — no dedo só muda a
 * altura do alvo e o tamanho do rótulo.
 */
export function MSelect({ label, error, options = [], ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {label && <span style={{ color: M.mute, fontSize: 12 }}>{label}</span>}
      <Select
        options={options}
        error={error}
        style={{ padding: '14px 40px 14px 16px', fontSize: 16 }}
        aria-label={label}
        {...props}
      />
    </div>
  );
}
