'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { T, R, W } from '@/app/lib/theme';
import { useExitTransition, useKeepWhileClosing } from '@/app/hooks/useExitTransition';

/**
 * Componentes compartilhados por desktop e mobile.
 * Superfície chapada: os três níveis de cor já separam o conteúdo, então
 * nenhum destes elementos carrega borda, blur ou sombra decorativa.
 */
const G = {
  card: { background: T.card, borderRadius: R.card },
  input: {
    background: T.chip,
    border: '1px solid transparent',
    borderRadius: R.control,
    padding: '13px 15px',
    color: T.text,
    fontSize: 15,
    fontWeight: W.body,
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.2s',
  },
  inputError: { borderColor: 'rgba(248,113,113,0.5)' },
  label: { fontSize: 11, fontWeight: W.body, color: T.mute },
};

export function Button({ children, variant = 'primary', className = '', loading = false, style = {}, ...props }) {
  const styles = {
    primary: { background: T.accent, color: T.onAccent, hover: '#FFD230' },
    secondary: { background: T.chip, color: T.text, hover: '#2E2E2E' },
    ghost: { background: 'transparent', color: T.mute, hover: T.chip },
    danger: { background: T.dangerSoft, color: T.danger, hover: 'rgba(248,113,113,0.2)' },
  };
  const { hover, ...base } = styles[variant];
  const idle = base.background;

  return (
    <button
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: T.display, fontWeight: W.strong, fontSize: 14,
        padding: '12px 20px', borderRadius: R.control, border: 'none',
        cursor: props.disabled || loading ? 'not-allowed' : 'pointer',
        opacity: props.disabled || loading ? 0.5 : 1,
        transition: 'background-color 0.15s ease, opacity 0.2s',
        ...base,
        ...style,
      }}
      onMouseEnter={e => { if (!props.disabled && !loading) e.currentTarget.style.background = hover; }}
      onMouseLeave={e => { e.currentTarget.style.background = style.background ?? idle; }}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : children}
    </button>
  );
}

export function Input({ label, error, style = {}, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={G.label}>{label}</label>}
      <input style={{ ...G.input, ...(error ? G.inputError : {}), ...style }} {...props} />
      {error && <span style={{ fontSize: 12, color: T.danger }}>{error}</span>}
    </div>
  );
}

/**
 * Texto de vários parágrafos — hoje só o feedback pede um.
 *
 * Mesma superfície do `Input`, porque é o mesmo campo: o que muda é que a
 * pessoa escreve mais de uma linha. `resize: vertical` fica: quem tem muito a
 * dizer estica, e o horizontal quebraria a caixa.
 */
export function Textarea({ label, error, hint, rows = 5, style = {}, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={G.label}>{label}</label>}
      <textarea
        rows={rows}
        style={{
          ...G.input,
          ...(error ? G.inputError : {}),
          fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical',
          ...style,
        }}
        {...props}
      />
      {error ? (
        <span style={{ fontSize: 12, color: T.danger }}>{error}</span>
      ) : (
        hint && <span style={{ fontSize: 12, color: T.faint }}>{hint}</span>
      )}
    </div>
  );
}

export function Card({ children, style = {}, className = '' }) {
  return (
    <div style={{ ...G.card, padding: 20, ...style }} className={`anim-fade-up ${className}`}>
      {children}
    </div>
  );
}

export function Spinner({ size = 'md' }) {
  const s = { sm: 16, md: 24, lg: 40 }[size];
  return (
    <div style={{ width: s, height: s, border: `2px solid ${T.accentSoft}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  );
}

export function Badge({ children, variant = 'default', className = '' }) {
  const colors = {
    default: { background: T.chip, color: T.text },
    success: { background: T.chip, color: T.text },
    warning: { background: T.accentSoft, color: T.accent },
    danger: { background: T.chip, color: T.danger },
    accent: { background: T.accentSoft, color: T.accent },
  };
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: R.badge, fontSize: 11, fontWeight: W.body, ...colors[variant] }}>
      {children}
    </span>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{ position: 'relative', width: 44, height: 24, borderRadius: R.badge, transition: 'background 0.2s', background: checked ? T.accent : T.chip, flexShrink: 0 }}
      >
        <div style={{ position: 'absolute', top: 4, left: checked ? 24 : 4, width: 16, height: 16, background: checked ? '#000' : T.text, borderRadius: '50%', transition: 'left 0.2s' }} />
      </div>
      {label && <span style={{ color: T.text, fontSize: 14 }}>{label}</span>}
    </label>
  );
}

export function Skeleton({ className = '', style = {} }) {
  return <div style={{ background: `linear-gradient(90deg, ${T.chip} 25%, #2E2E2E 50%, ${T.chip} 75%)`, backgroundSize: '200% 100%', borderRadius: R.control, animation: 'shimmer 1.4s ease-in-out infinite', ...style }} className={className} />;
}

/**
 * `maxWidth` existe para as caixas que listam linhas com controle do lado
 * direito (colaboradores, solicitações): em 400px o dropdown espreme o nome.
 * O padrão continua sendo 400 — formulário e confirmação não querem mais.
 */
export function Modal({ open, onClose, title, children, maxWidth = 400 }) {
  const { mounted, closing } = useExitTransition(open);

  // O conteúdo é congelado na saída: quase toda chamada zera o estado no
  // `onClose` (`setDeleteModal(null)`), e sem isso o texto sumiria antes da
  // animação acabar.
  const shownTitle = useKeepWhileClosing(title, open);
  const shownChildren = useKeepWhileClosing(children, open);

  if (!mounted) return null;

  return (
    <div
      className={closing ? 'anim-fade-out' : 'anim-fade-in'}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className={closing ? 'anim-scale-out' : 'anim-scale-in'}
        style={{ position: 'relative', background: T.card, borderRadius: R.card, padding: 22, width: '100%', maxWidth }}
      >
        {shownTitle && <h2 style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text, marginBottom: 16 }}>{shownTitle}</h2>}
        {shownChildren}
      </div>
    </div>
  );
}

/** Espaço mínimo abaixo do gatilho para a lista abrir para baixo. */
const LIST_MIN_SPACE = 180;
const LIST_MAX_HEIGHT = 260;

/**
 * Lista suspensa própria — ver `.select-trigger` e `.select-list` no globals.css.
 *
 * A lista vai para um portal preso ao `body` e posicionada em coordenadas de
 * tela: dentro do fluxo, qualquer ancestral com `overflow: hidden` (as linhas de
 * colaborador, as tabelas) cortaria o painel na primeira opção.
 *
 * O foco não sai do gatilho enquanto a lista está aberta. É ele quem escuta as
 * setas e aponta o item corrente por `aria-activedescendant` — o mesmo desenho
 * que o `<select>` nativo usa, e que evita ter de devolver o foco na hora de
 * fechar.
 *
 * `onChange` recebe um evento com `target.value`, como o campo nativo entregava:
 * quem chama (react-hook-form incluso) não precisa saber que a lista mudou.
 */
export function Select({
  label,
  error,
  options = [],
  value,
  onChange,
  onBlur,
  name,
  disabled = false,
  placeholder = 'Selecione',
  raised = false,
  className = '',
  style = {},
  wrapperClassName = '',
  wrapperStyle = {},
  triggerId,
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [box, setBox] = useState(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const selectedIndex = options.findIndex((o) => String(o.value) === String(value));
  const selected = options[selectedIndex];

  // Controle miúdo (a linha de colaborador) pede item miúdo: opção com a altura
  // do formulário ao lado de um gatilho de 34px faz a lista parecer outra peça.
  const compact = (style.fontSize ?? 15) <= 13;
  const optionStyle = compact
    ? { padding: '7px 10px', fontSize: 12 }
    : { padding: '10px 12px', fontSize: 14 };

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const below = window.innerHeight - rect.bottom;
    const dropUp = below < LIST_MIN_SPACE && rect.top > below;
    const room = (dropUp ? rect.top : below) - 12;

    setBox({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(LIST_MAX_HEIGHT, room),
      ...(dropUp
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    // `true` na captura: a rolagem que importa costuma ser a de um contêiner
    // interno, e ela não borbulha até a janela.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (triggerRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  // Item corrente sempre visível quando a navegação é por teclado
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  function openList(startIndex) {
    if (disabled) return;
    setActiveIndex(startIndex);
    setOpen(true);
  }

  function commit(index) {
    const option = options[index];
    setOpen(false);
    if (!option || String(option.value) === String(value)) return;
    onChange?.({ target: { name, value: option.value } });
  }

  function handleKeyDown(e) {
    const step = (delta) => {
      e.preventDefault();
      const from = activeIndex >= 0 ? activeIndex : selectedIndex;
      const next = Math.min(options.length - 1, Math.max(0, from + delta));
      if (open) setActiveIndex(next);
      else openList(Math.max(0, from));
    };

    switch (e.key) {
      case 'ArrowDown': return step(1);
      case 'ArrowUp': return step(-1);
      case 'Home': e.preventDefault(); return open ? setActiveIndex(0) : openList(0);
      case 'End': e.preventDefault(); return open ? setActiveIndex(options.length - 1) : openList(options.length - 1);
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (open) commit(activeIndex);
        else openList(selectedIndex >= 0 ? selectedIndex : 0);
        return;
      case 'Escape':
        if (open) { e.preventDefault(); setOpen(false); }
        return;
      case 'Tab':
        setOpen(false);
        return;
      default:
        return;
    }
  }

  return (
    // Medida de largura vai no invólucro, não no gatilho: aqui dentro o eixo
    // principal é vertical, e um `flexBasis` no botão viraria altura.
    <div className={wrapperClassName} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...wrapperStyle }}>
      {label && <label style={G.label}>{label}</label>}

      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        className={`select-trigger ${raised ? 'select-trigger--raised' : ''} ${open ? 'is-open' : ''} ${error ? 'is-error' : ''} ${className}`}
        style={{ padding: '13px 38px 13px 15px', fontSize: 15, fontWeight: W.body, ...style }}
        onClick={() => (open ? setOpen(false) : openList(selectedIndex >= 0 ? selectedIndex : 0))}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? T.text : T.faint }}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2.2}
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none', flexShrink: 0 }}
        />
      </button>

      {open && box && createPortal(
        <div
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel ?? label}
          className="select-list"
          style={{ position: 'fixed', ...box }}
        >
          {options.map((opt, i) => (
            <button
              key={opt.value}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === selectedIndex}
              className={`select-option ${i === activeIndex ? 'is-active' : ''} ${i === selectedIndex ? 'is-selected' : ''}`}
              style={{ ...optionStyle, fontWeight: W.body, fontFamily: 'inherit' }}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => commit(i)}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
              {i === selectedIndex && <Check size={14} strokeWidth={2.4} style={{ flexShrink: 0 }} />}
            </button>
          ))}
        </div>,
        document.body
      )}

      {error && <span style={{ fontSize: 12, color: T.danger }}>{error}</span>}
    </div>
  );
}
