'use client';
import { useId } from 'react';
import { T, R } from '@/app/lib/theme';
import { Select } from '@/app/components/ui';
import { useDirecaoDaTela } from '@/app/lib/telaMovel';

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
 * Ela desliza ao entrar, pelo lado em que está na barra de baixo (ver
 * `useDirecaoDaTela`): ir para a direita traz a tela nova da direita, voltar
 * traz da esquerda. Sem isso, trocar de tela é um corte seco, e num telefone,
 * onde a tela inteira muda de uma vez, o corte não diz se a pessoa avançou ou
 * voltou — ela confere o ícone aceso para saber onde caiu.
 *
 * Quem anda é o conteúdo, e não o `<main>`: o fundo fica parado e a tela nova
 * passa por cima dele, em vez de o próprio fundo escorregar e descobrir o que
 * há atrás. E o `<main>` recorta o que sai pela borda, senão a tela que vem da
 * direita alarga a página e o telefone ganha rolagem horizontal — foi o que
 * aconteceu com os cartões da fila "Concluídos" do responsável.
 *
 * `clip` e não `hidden`: com `hidden` num eixo, o outro vira `auto`, e o
 * `<main>` viraria um contentor de rolagem próprio dentro da página.
 *
 * A barra inferior é portada para o `<body>` (ver `BottomNav`), e não é
 * elegância: elemento com `transform` vira bloco de contenção, e filho
 * `position: fixed` passa a se posicionar em relação a ele em vez da janela —
 * a barra viajaria com a tela e depois pararia no lugar errado. As classes de
 * deslizar usam `animation-fill-mode: backwards` para não deixar transform
 * nenhum quando acabam, mas durante os 380ms ele existe, e é a barra que não
 * pode estar debaixo dele.
 */
export function MPage({ children, pad = true }) {
  const entrada = useDirecaoDaTela();

  return (
    // `<main>` e não `<div>`: é o marco que o leitor de tela usa para pular
    // direto ao conteúdo, e é o alvo do "Pular para o conteúdo" do layout. As
    // telas do desktop já tinham o seu; o telefone é que estava sem.
    <main id={CONTENT_ID} style={{ minHeight: '100vh', background: M.bg, paddingBottom: 108, overflowX: 'clip' }}>
      <div className={entrada} style={{ padding: pad ? '0 16px' : 0 }}>{children}</div>
    </main>
  );
}

/**
 * A folga acima do título, no telefone.
 *
 * Eram 52px fixos, e eles faziam dois trabalhos ao mesmo tempo: desviar do
 * entalhe do aparelho e dar respiro ao título. Quem abre no navegador não tem
 * entalhe nenhum — a barra de endereço já ocupa aquela faixa —, e pagava os
 * 52px assim mesmo: o conteúdo nascia longe do topo sem motivo.
 *
 * Agora são duas parcelas. `env(safe-area-inset-top)` é a medida que o próprio
 * aparelho informa, e ela vale zero onde não há o que desviar (o `layout.js`
 * declara `viewportFit: 'cover'`, que é o que faz o navegador informá-la de
 * verdade). Os 20px são o respiro, e só ele.
 */
export const RESPIRO_TOPO = 'calc(20px + env(safe-area-inset-top))';

/** Barra do topo: título grande à esquerda, botões redondos à direita. */
export function MTopBar({ eyebrow, title, accent, actions, avatar, className = '' }) {
  return (
    <header className={className} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${RESPIRO_TOPO} 0 22px` }}>
      {avatar}
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <p style={{ color: M.faint, fontSize: 12, marginBottom: 2 }}>{eyebrow}</p>}
        <h1 style={{ fontFamily: M.display, fontWeight: 600, fontSize: 22, color: M.text, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
          {title}{accent && <span style={{ color: M.accentInk }}> {accent}</span>}
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
  const base = { background: M.card, borderRadius: R.card, boxShadow: M.cardRing, padding: 18 };

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
        <div key={label} style={{ background: M.chip, borderRadius: R.control, padding: '12px 8px', textAlign: 'center' }}>
          <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 17, color: M.text, lineHeight: 1.1 }}>{value}</p>
          <p style={{ color: M.mute, fontSize: 12, marginTop: 3 }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

const BUTTON_BASE = {
  border: 'none', cursor: 'pointer', borderRadius: R.control, padding: '14px 18px',
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
      style={{ ...BUTTON_BASE, background: M.accentSoft, color: M.accentInk, opacity: disabled || loading ? 0.5 : 1, ...style }}>
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
      borderRadius: R.pill, padding: '7px 14px', fontFamily: M.display, fontWeight: 600, fontSize: 14,
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

  // Rótulo e erro como irmãos, e não com o erro dentro do `<label>`: ali o
  // texto do erro entrava no nome do campo, e o leitor de tela anunciava os
  // dois juntos como se fossem o rótulo.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {label && <label htmlFor={fieldId} style={{ color: M.mute, fontSize: 12 }}>{label}</label>}
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{
          background: M.chip, border: `1px solid ${error ? 'rgba(248,113,113,0.5)' : 'var(--input-line)'}`,
          // 16px é o piso: abaixo disso o iOS dá zoom ao focar e a tela salta.
          borderRadius: R.control, padding: '14px 16px', color: M.text, fontSize: 16, outline: 'none', width: '100%',
          ...style,
        }}
        {...props}
      />
      {error && <span id={errorId} role="alert" style={{ color: M.danger, fontSize: 12 }}>{error}</span>}
    </div>
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
      {/* `aria-hidden`: quem nomeia o droplist é o `aria-label` do gatilho, logo
          abaixo. Sem isto o leitor de tela lê o rótulo duas vezes. */}
      {label && <span aria-hidden="true" style={{ color: M.mute, fontSize: 12 }}>{label}</span>}
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
