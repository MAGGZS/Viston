'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { T, R, W, NUM } from '@/app/lib/theme';
import { useExitTransition, useKeepWhileClosing } from '@/app/hooks/useExitTransition';

/**
 * Componentes compartilhados por desktop e mobile.
 * Superfície chapada: os três níveis de cor já separam o conteúdo, então
 * nenhum destes elementos carrega borda, blur ou sombra decorativa.
 */
const G = {
  card: { background: T.card, borderRadius: R.card, boxShadow: T.cardRing },
  input: {
    background: T.chip,
    // Separadas, e não o atalho `border`: o estado de erro sobrepõe apenas
    // `borderColor`, e misturar os dois faz o React avisar e a borda não voltar
    // à cor original quando o erro some.
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--input-line)',
    borderRadius: R.control,
    padding: '13px 15px',
    color: T.text,
    // 16px, e não 15: abaixo de 16 o iOS dá zoom automático ao focar o campo, e
    // o formulário de vistoria sai do lugar no meio do preenchimento.
    fontSize: 16,
    fontWeight: W.body,
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.2s',
  },
  inputError: { borderColor: 'rgba(248,113,113,0.5)' },
  label: { fontSize: 12, fontWeight: W.body, color: T.mute },
};

/**
 * Botão do produto.
 *
 * O hover mora no CSS (`.btn`, em globals.css) e a cor de cada variante entra
 * por variável. Em JS ele custava caro: teclado sem realce, estado grudado
 * depois do toque no telefone, e a cor original adivinhada na volta. `type` é
 * `button` por padrão — dentro de `<form>`, o padrão do HTML é enviar.
 */
export function Button({ children, variant = 'primary', className = '', loading = false, style = {}, type = 'button', ...props }) {
  const styles = {
    primary: { background: T.accent, color: T.onAccent, hover: 'var(--color-accent-hover)' },
    secondary: { background: T.chip, color: T.text, hover: 'var(--color-hover-strong)' },
    ghost: { background: 'transparent', color: T.mute, hover: T.chip },
    danger: { background: T.dangerSoft, color: T.danger, hover: 'rgba(248,113,113,0.2)' },
  };
  const { hover, ...base } = styles[variant];

  return (
    <button
      type={type}
      className={`btn ${className}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: T.display, fontWeight: W.strong, fontSize: 14,
        padding: '12px 20px', borderRadius: R.control, border: 'none',
        cursor: props.disabled || loading ? 'not-allowed' : 'pointer',
        opacity: props.disabled || loading ? 0.5 : 1,
        ...base,
        ...style,
        // Depois do `style` de quem chama: quem troca a cor de fundo troca junto
        // a de hover, senão o realce voltaria à cor da variante.
        '--btn-hover': style.background ? undefined : hover,
      }}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : children}
    </button>
  );
}

/**
 * Campo de texto.
 *
 * O erro é amarrado ao campo (`aria-describedby`) e anunciado quando aparece
 * (`role="alert"`). Sem isso ele era só um texto vermelho ao lado: quem usa
 * leitor de tela mandava o formulário, ouvia silêncio e não sabia nem que havia
 * erro nem em qual campo — e no formulário de vistoria são cinco campos por
 * ocorrência.
 *
 * O rótulo vira `<label htmlFor>` de verdade: `<label>` solto não liga a nada, e
 * o campo ficava sem nome.
 */
export function Input({ label, error, id, style = {}, ...props }) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  const errorId = `${inputId}-erro`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label htmlFor={inputId} style={G.label}>{label}</label>}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{ ...G.input, ...(error ? G.inputError : {}), ...style }}
        {...props}
      />
      {error && <span id={errorId} role="alert" style={{ fontSize: 12, color: T.danger }}>{error}</span>}
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
export function Textarea({ label, error, hint, id, rows = 5, style = {}, ...props }) {
  const generatedId = useId();
  const fieldId = id ?? props.name ?? generatedId;
  const errorId = `${fieldId}-erro`;
  const hintId = `${fieldId}-dica`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label htmlFor={fieldId} style={G.label}>{label}</label>}
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        style={{
          ...G.input,
          ...(error ? G.inputError : {}),
          fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical',
          ...style,
        }}
        {...props}
      />
      {error ? (
        <span id={errorId} role="alert" style={{ fontSize: 12, color: T.danger }}>{error}</span>
      ) : (
        hint && <span id={hintId} style={{ fontSize: 12, color: T.faint }}>{hint}</span>
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

/**
 * Um número do painel e o que ele significa.
 *
 * O mesmo cartão existia escrito três vezes — no painel do admin, no do
 * moderador e no do prédio —, e as três cópias já discordavam no tamanho do
 * número e no do ícone. Aqui é um só, e as três telas passam a ler igual.
 *
 * A leitura vai de cima para baixo, e não da esquerda para a direita: rótulo,
 * depois número. Com o ícone no meio da linha, como estava, ele entrava antes
 * do número no caminho do olho — e ícone não é dado. Encostado no canto, ele
 * volta a ser o que é: a marca que distingue um cartão do outro na fileira.
 *
 * `aria-hidden` no ícone porque ele não acrescenta nada ao que o rótulo já diz.
 */
export function StatCard({ icon: Icon, label, value, hint, loading = false, className = '', style = {} }) {
  return (
    <div
      className={className}
      // Recuo e vão apertados de propósito: o cartão tem de caber no número, e
      // não o contrário. Com 20 de recuo e 16 de vão sobrava fundo vazio em
      // volta do 34px, e a fileira ocupava mais altura do que tinha o que
      // dizer — 148px para carregar um número de dois dígitos. Assim são 102,
      // e 120 nos dois cartões que trazem dica.
      style={{ ...G.card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, ...style }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <p style={{
          color: T.mute, fontSize: 11, fontWeight: W.strong,
          // Caixa alta pede respiro entre as letras; sem ele o rótulo fecha num
          // bloco só. O leitor de tela continua ouvindo o texto como foi escrito.
          letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.45,
        }}>
          {label}
        </p>
        {Icon && (
          <span
            aria-hidden="true"
            style={{
              width: 30, height: 30, borderRadius: R.badge, background: T.accentSoft, color: T.accentInk,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Icon size={15} />
          </span>
        )}
      </div>

      <div style={{ marginTop: 'auto' }}>
        {loading ? (
          <Skeleton style={{ height: 32, width: 76 }} />
        ) : (
          <p style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 34, lineHeight: 1.05, color: T.text, ...NUM }}>
            {value ?? 0}
          </p>
        )}
        {hint && <p style={{ color: T.faint, fontSize: 11, marginTop: 2 }}>{hint}</p>}
      </div>
    </div>
  );
}

export function Spinner({ size = 'md', className = '' }) {
  const s = { sm: 16, md: 24, lg: 40 }[size];
  return (
    <div
      suppressHydrationWarning
      className={className}
      style={{ width: s, height: s, border: `2px solid ${T.accentSoft}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}
    />
  );
}

/**
 * A etiqueta de estado.
 *
 * `success` era cópia exata de `default` — mesmo fundo, mesma letra. Seis
 * lugares pediam a variante ("Concluído", "Andar OK", "Inspetor", vistoria
 * finalizada) e os seis recebiam a etiqueta neutra: o código dizia que aquilo
 * era boa notícia e a tela não dizia nada. Agora ela usa o verde do produto, na
 * mesma forma de `danger`, que é a outra etiqueta que fala por cor sobre o fundo
 * de chip.
 */
export function Badge({ children, variant = 'default', className = '' }) {
  const colors = {
    default: { background: T.chip, color: T.text },
    success: { background: T.chip, color: T.success },
    warning: { background: T.accentSoft, color: T.accentInk },
    danger: { background: T.chip, color: T.danger },
    accent: { background: T.accentSoft, color: T.accentInk },
  };
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: R.badge, fontSize: 12, fontWeight: W.body, ...colors[variant] }}>
      {children}
    </span>
  );
}

/**
 * Chave liga/desliga.
 *
 * Um `<input type="checkbox">` de verdade por baixo, escondido só visualmente:
 * a `<div onClick>` que existia aqui não recebia foco, não virava com Espaço e
 * o leitor de tela não sabia dizer se estava ligada. E ela decide coisa séria —
 * é o "nada a relatar" do andar.
 *
 * `opacity: 0` e não `display: none`: o que está escondido assim sai da ordem
 * do Tab, e voltaríamos ao começo.
 */
export function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, margin: 0 }}
      />
      <span
        aria-hidden="true"
        style={{ position: 'relative', width: 44, height: 24, borderRadius: R.badge, transition: 'background 0.2s', background: checked ? T.accent : T.chip, flexShrink: 0 }}
      >
        <span style={{ position: 'absolute', top: 4, left: checked ? 24 : 4, width: 16, height: 16, background: checked ? '#000' : T.text, borderRadius: '50%', transition: 'left 0.2s' }} />
      </span>
      {label && <span style={{ color: T.text, fontSize: 14 }}>{label}</span>}
    </label>
  );
}

export function Skeleton({ className = '', style = {} }) {
  return <div style={{ background: `linear-gradient(90deg, ${T.chip} 25%, var(--color-hover-strong) 50%, ${T.chip} 75%)`, backgroundSize: '200% 100%', borderRadius: R.control, animation: 'shimmer 1.4s ease-in-out infinite', ...style }} className={className} />;
}

/**
 * Quantas caixas estão abertas.
 *
 * O `<dialog>` deixa o fundo inerte ao clique e ao teclado, mas não impede a
 * roda do mouse de rolar a página atrás — o texto anda embaixo da caixa
 * enquanto se lê. A trava é nossa; a contagem existe porque caixa abre sobre
 * caixa (o dia do calendário abre a prévia, que abre o relatório), e a primeira
 * a fechar não pode destravar o que a segunda ainda segura.
 */
let openDialogs = 0;

function lockPageScroll() {
  if (openDialogs === 0) document.body.style.overflow = 'hidden';
  openDialogs += 1;

  return () => {
    openDialogs -= 1;
    if (openDialogs === 0) document.body.style.overflow = '';
  };
}

/**
 * A caixa de diálogo do produto — `<dialog>` de verdade.
 *
 * O que era uma `<div>` com sobreposição não era um diálogo para ninguém que
 * não enxergasse a tela: nada anunciava a abertura, `Tab` continuava passeando
 * pela página atrás, `Escape` não fechava e, no fim, o foco voltava para o
 * `<body>` em vez do botão que abriu. Tudo isso o elemento nativo faz sozinho,
 * e faz igual em todo navegador.
 *
 * A caixa também deixa de precisar de portal: `showModal()` põe o elemento na
 * *top layer*, fora de qualquer bloco de contenção — que era exatamente o
 * problema que o portal contornava (ver a nota do `transform` no MPage).
 *
 * Quem chama continua mandando em `open`: `onCancel` (o Escape) e o clique no
 * fundo só avisam, e é o estado de fora que fecha. É o que mantém a animação de
 * saída, e o que impede a caixa de fechar sem quem a abriu ficar sabendo.
 */
export function Dialog({
  onClose,
  className = '',
  style = {},
  labelledBy,
  'aria-label': ariaLabel,
  children,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!el.open) el.showModal();
    return lockPageScroll();
    // Roda uma vez por montagem: quem controla a saída é `useExitTransition`,
    // que mantém o elemento no DOM até a animação acabar — e tirá-lo do DOM já
    // fecha o diálogo. Fechar aqui, no `open` falso, cortaria a animação.
  }, []);

  return (
    // O `onClick` aqui é o clique no *backdrop*, que só o próprio `<dialog>`
    // recebe — e o equivalente de teclado é o Escape, que o `onCancel` logo
    // abaixo trata. A regra não sabe disso: para ela, `<dialog>` é elemento sem
    // interação.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      style={style}
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      // Clique no fundo: só o próprio `<dialog>` recebe o evento do backdrop,
      // porque o miolo é um filho e nenhum preenchimento sobra em volta dele.
      onClick={(e) => {
        if (e.target === ref.current) onClose?.();
      }}
    >
      {children}
    </dialog>
  );
}

/**
 * `maxWidth` existe para as caixas que listam linhas com controle do lado
 * direito (colaboradores, solicitações): em 400px o dropdown espreme o nome.
 * O padrão continua sendo 400 — formulário e confirmação não querem mais.
 */
export function Modal({ open, onClose, title, children, maxWidth = 400 }) {
  const { mounted, closing } = useExitTransition(open);
  const titleId = useId();

  // O conteúdo é congelado na saída: quase toda chamada zera o estado no
  // `onClose` (`setDeleteModal(null)`), e sem isso o texto sumiria antes da
  // animação acabar.
  const shownTitle = useKeepWhileClosing(title, open);
  const shownChildren = useKeepWhileClosing(children, open);

  if (!mounted) return null;

  return (
    <Dialog
      onClose={onClose}
      className={closing ? 'is-closing' : ''}
      style={{ width: maxWidth, maxWidth: 'min(100vw - 32px, 100%)' }}
      labelledBy={shownTitle ? titleId : undefined}
      aria-label={shownTitle ? undefined : 'Caixa de diálogo'}
    >
      {/*
        A caixa cresce com o que tem dentro, até a altura da janela — e daí em
        diante o miolo rola.

        Sem isto, conteúdo alto simplesmente saía da tela: o `<dialog>` é
        `overflow: visible`, e uma ocorrência com descrição longa, relato do
        responsável e a linha do tempo inteira passa fácil da altura do
        telefone. O que ficava para fora não tinha como ser alcançado — nem
        rolando a página, que o `<dialog>` trava.

        `maxHeight: 'inherit'` pega o teto que o `.dialog` já declara no
        globals.css, em vez de repetir o número aqui. Dois lugares com a mesma
        medida viram um dia dois números diferentes.

        O título fica de fora da rolagem: em caixa alta, ele é o que diz onde a
        pessoa está, e some justamente quando ela precisa dele.
      */}
      <div
        className={closing ? 'anim-scale-out' : 'anim-scale-in'}
        style={{
          background: T.card, borderRadius: R.card, boxShadow: T.cardRing,
          maxHeight: 'inherit', display: 'flex', flexDirection: 'column',
        }}
      >
        {shownTitle && (
          <h2 id={titleId} style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text, padding: '22px 22px 0', flexShrink: 0 }}>
            {shownTitle}
          </h2>
        )}
        {/*
          O recuo é do miolo que rola, e não da caixa em volta dele.

          Contêiner de rolagem recorta no limite do próprio recuo — e recorta
          tudo, inclusive sombra que vive fora da borda do filho. Com o recuo na
          caixa e o miolo colado nas beiradas, o anel dourado de 2px que marca o
          tema escolhido na caixa de Aparência saía cortado; o mesmo valia para
          o fio do `cardRing` de qualquer filho encostado na borda. Movido para
          cá, há folga dos quatro lados antes do corte.

          Os quatro, e este é o detalhe que custou uma segunda passada: a folga
          de cima era `marginBottom` no título, e margem do vizinho não conta —
          o corte acontece na borda do miolo, que ficava colada no conteúdo. O
          anel continuava decepado em cima. Agora o espaço entre título e miolo
          é recuo do próprio miolo, e ele afasta a borda do corte junto.

          De quebra, a barra de rolagem passa a correr rente à borda da caixa,
          que é onde se espera encontrá-la — e não afundada 22px para dentro.

          `minHeight: 0` é o que deixa o filho de um flex encolher abaixo do
          próprio conteúdo. Sem ele o miolo empurra a caixa para fora da tela e
          a rolagem nunca chega a acontecer.
        */}
        <div style={{ overflowY: 'auto', minHeight: 0, padding: shownTitle ? '16px 22px 22px' : 22 }}>
          {shownChildren}
        </div>
      </div>
    </Dialog>
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
  /**
   * Onde a lista é pendurada.
   *
   * Normalmente o `body`. Dentro de um `Modal`, não: `<dialog>` aberto com
   * `showModal()` vive na *top layer* do navegador, que é pintada acima de todo
   * o documento — nenhum `z-index` no `body` alcança lá, e a lista sumia atrás
   * da caixa. Pendurada no próprio `<dialog>`, ela sobe junto.
   *
   * O `position: fixed` continua valendo porque `.dialog` não tem transform:
   * um ancestral transformado viraria o bloco de contenção e as coordenadas de
   * tela passariam a ser medidas a partir dele.
   */
  const [host, setHost] = useState(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const errorId = `${listId}-erro`;

  const selectedIndex = options.findIndex((o) => String(o.value) === String(value));
  const selected = options[selectedIndex];

  // Controle miúdo (a linha de colaborador) pede item miúdo: opção com a altura
  // do formulário ao lado de um gatilho de 34px faz a lista parecer outra peça.
  const compact = (style.fontSize ?? 16) <= 14;
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
    // Resolvido na abertura, e não no render: é aqui que se sabe onde o gatilho
    // está montado, e o mesmo Select pode servir dentro e fora de um modal.
    setHost(triggerRef.current?.closest('dialog') ?? document.body);
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

      {/*
        O rótulo visível nomeia o gatilho por `aria-label`.

        O `<label>` acima não aponta para nada: não há `htmlFor`, e envolver o
        botão com ele faria clicar no texto abrir a lista. Sem o `aria-label`,
        quem só ouve a tela chegava a "caixa de combinação" sem nome nenhum —
        justamente o cuidado que o `Input` e o `Textarea` deste arquivo já tomam.
        `aria-label` explícito continua vencendo, para quem quer um nome falado
        diferente do escrito.
      */}
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        // O rótulo visível também nomeia o gatilho — ver a nota acima do <button>.
        aria-label={ariaLabel ?? label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        className={`select-trigger ${raised ? 'select-trigger--raised' : ''} ${open ? 'is-open' : ''} ${error ? 'is-error' : ''} ${className}`}
        style={{ padding: '13px 38px 13px 15px', fontSize: 16, fontWeight: W.body, ...style }}
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
        host ?? document.body
      )}

      {error && <span id={errorId} role="alert" style={{ fontSize: 12, color: T.danger }}>{error}</span>}
    </div>
  );
}
