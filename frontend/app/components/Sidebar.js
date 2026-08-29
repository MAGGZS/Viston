'use client';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Logo } from '@/app/components/Logo';
import { T, R, W, NUM } from '@/app/lib/theme';

/**
 * A barra lateral do sistema — a mesma peça no admin, no moderador e no gestor.
 *
 * Ela abre e fecha: aberta traz os rótulos, recolhida vira um trilho só de
 * ícones. O desenho é feito para sobreviver a essa troca — o ícone de cada aba
 * fica sobre o mesmo eixo vertical nos dois estados (o centro do trilho, a 36px
 * da borda), e a marca lá em cima também. Fechar não desloca nada de lugar: o
 * que sai é o texto, deslizando para fora junto com a borda.
 *
 * É por isso que a marca aqui é só a logo base, com "VISTON" escrito ao lado
 * pelo código, e não o lockup deitado em vetor: o texto precisa ser um elemento
 * próprio para poder sumir sozinho.
 */
export const SIDEBAR_OPEN = 224;
export const SIDEBAR_RAIL = 72;

/** Sai rápido e assenta no fim — a curva de painel que desliza. */
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const WIDTH_MS = 280;

/**
 * O recuo que centra o conteúdo no trilho.
 *
 * `(72 - 12*2 - 16) / 2 = 16`, com 12 de respiro da navegação e o ícone de 16.
 * O mesmo número serve à marca porque ela tem 39,5px de largura no corpo 18:
 * `(72 - 39,5) / 2 ≈ 16`. Trocar um destes valores sem refazer a conta tira a
 * coluna do eixo.
 */
const INSET = 16;

const itemBase = {
  display: 'flex', alignItems: 'center', gap: 12,
  // `R.pill`, e não os 14 soltos que estavam aqui: a seleção é a única forma
  // sólida da barra, e ficava com um canto que não existia em mais lugar nenhum
  // do produto.
  padding: `10px ${INSET}px`, borderRadius: R.pill,
  fontFamily: T.display, fontSize: 14, textDecoration: 'none',
  whiteSpace: 'nowrap', overflow: 'hidden',
  transition: 'background-color 0.15s, color 0.15s',
};

/**
 * A medida do aviso, seja ele pílula na barra aberta ou dentro do balão.
 *
 * 18 num item de 41: o contador é aviso, não título. A 20 ele disputava altura
 * com a própria seleção que o carrega — e é ela que diz onde a pessoa está.
 * Altura fixa e `inline-flex` centrado, para o número não pender de um lado
 * conforme a fonte resolva a entrelinha.
 */
const COUNT_SIZE = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 18, height: 18, padding: '0 5px', borderRadius: R.badge,
  fontSize: 11, fontWeight: W.strong, ...NUM,
};

/**
 * Como o texto entra e sai.
 *
 * Os dois tempos são diferentes de propósito. Ao recolher, o rótulo some em
 * 100ms — bem antes da borda chegar nele —, senão a palavra é vista sendo
 * cortada ao meio. Ao abrir, ele espera 120ms: aparecer enquanto ainda não há
 * largura para ele daria o mesmo corte, agora de trás para frente.
 */
function labelStyle(collapsed, animated) {
  if (!animated) return { opacity: collapsed ? 0 : 1 };

  return {
    opacity: collapsed ? 0 : 1,
    transition: collapsed ? 'opacity 0.1s ease' : 'opacity 0.18s ease 0.12s',
  };
}

/**
 * Quantos itens esperam por quem está lendo.
 *
 * Sobre o item ativo — que já é dourado — a pílula inverte: dourado sobre
 * dourado não se lê, e o número é justamente o que precisa ser visto.
 *
 * A inversão é sólida, e não um preto a 18% como já foi. Translúcida, ela não
 * era nem pílula nem fundo: uma mancha de contorno indeciso no meio da única
 * forma cheia da barra. Preto inteiro com o número em dourado devolve a ela a
 * mesma nitidez que a versão não selecionada tem sobre o escuro.
 */
function CountBadge({ count, active }) {
  return (
    <span style={{
      ...COUNT_SIZE,
      marginLeft: 'auto',
      background: active ? T.onAccent : T.accent,
      color: active ? T.accent : T.onAccent,
    }}>
      {count}
    </span>
  );
}

/**
 * O mesmo aviso, recolhido.
 *
 * A barra estreita não tem onde escrever o número — e é justamente nela que o
 * aviso mais importa, porque os rótulos sumiram. Vira um ponto no canto do
 * ícone: diz que há algo ali sem pedir espaço que não existe.
 *
 * Preso ao ícone, e não à borda direita do item: o ícone é a única coisa que
 * não se move quando a barra abre e fecha. Ancorado na borda, o ponto
 * atravessaria a tela voando a cada clique.
 */
function CountDot({ active }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute', top: -3, right: -4,
        width: 9, height: 9, borderRadius: R.badge,
        background: active ? T.onAccent : T.accent,
        border: `2px solid ${active ? T.accent : T.bg}`,
      }}
    />
  );
}

/**
 * Uma aba da barra.
 *
 * Com `href` é navegação; com `onClick`, ação (sair, por exemplo). O rótulo
 * continua no DOM quando a barra está recolhida — só invisível —, então quem
 * usa leitor de tela ouve a mesma coisa nos dois estados. Para quem enxerga, o
 * balão ao lado (`.rail-tip`, em globals.css) devolve o nome no trilho, e ele
 * é `aria-hidden` justamente porque o rótulo verdadeiro já está ali.
 */
export function SidebarItem({
  href, onClick, icon: Icon, label, active = false, collapsed, animated, count,
}) {
  const style = {
    ...itemBase,
    fontWeight: active ? W.strong : W.body,
    background: active ? T.accent : 'transparent',
    color: active ? T.onAccent : T.mute,
  };

  const inner = (
    <>
      <span style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
        <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
        {!!count && collapsed && <CountDot active={active} />}
      </span>
      <span style={labelStyle(collapsed, animated)}>{label}</span>
      {!!count && !collapsed && <CountBadge count={count} active={active} />}
    </>
  );

  const hover = {
    onMouseEnter: (e) => { if (!active) e.currentTarget.style.background = T.chip; },
    onMouseLeave: (e) => { if (!active) e.currentTarget.style.background = 'transparent'; },
  };

  const item = href ? (
    <Link href={href} style={style} {...hover}>
      {inner}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      style={{ ...style, border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
      {...hover}
    >
      {inner}
    </button>
  );

  // Aberta, o rótulo está escrito no próprio item e o balão seria eco.
  if (!collapsed) return item;

  return (
    <div className="rail-item">
      {item}
      {/* O número vem junto: no trilho o aviso é um ponto, que diz que há algo
          esperando mas não quanto. Aqui há a largura que a barra estreita não
          tem, e é o mesmo gesto — quem parou o cursor para ler o nome é quem
          quer saber o tamanho da fila. */}
      <span className="rail-tip" aria-hidden="true">
        {label}
        {!!count && <span className="rail-tip__count">{count}</span>}
      </span>
    </div>
  );
}

/**
 * A marca no alto da barra: a logo base e, ao lado, o nome escrito em texto.
 *
 * O peso 900 é o do wordmark do arquivo — a mesma Poppins Black que foi
 * vetorizada lá —, então a palavra continua sendo a mesma palavra; o que muda é
 * que agora ela é texto, e some sozinha quando a barra recolhe.
 *
 * `subtitle` guarda o lugar mesmo recolhida: some junto com o nome, mas a
 * altura fica, e assim a navegação abaixo não pula ao abrir e fechar.
 */
export function SidebarBrand({ collapsed, animated, subtitle }) {
  return (
    <div style={{ padding: `20px ${INSET}px 18px`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Logo variant="mark" size={18} />
        <span style={{
          fontFamily: T.display, fontWeight: W.wordmark, fontSize: 17,
          color: T.text, lineHeight: 1, whiteSpace: 'nowrap',
          ...labelStyle(collapsed, animated),
        }}>
          VISTON
        </span>
      </div>

      {subtitle && (
        <p style={{
          color: T.faint, fontSize: 12, marginTop: 8,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          ...labelStyle(collapsed, animated),
        }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

/**
 * O botão de abrir e fechar.
 *
 * Mora na borda da barra, metade para fora, e não dentro do cabeçalho: ali ele
 * teria de disputar espaço com a marca justamente no estado em que não há
 * espaço nenhum. Fora do fluxo, ele fica no mesmo ponto da tela nos dois
 * estados — o alvo do clique não foge de quem acabou de clicar nele.
 */
function ToggleButton({ collapsed, animated, onToggle }) {
  const label = collapsed ? 'Expandir menu' : 'Recolher menu';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      className="transition-colors duration-150"
      style={{
        position: 'absolute', top: 30, right: -13, zIndex: 1,
        width: 26, height: 26, padding: 0, borderRadius: R.badge,
        background: T.chip, border: `1px solid ${T.line}`, color: T.mute,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.card; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = T.mute; e.currentTarget.style.background = T.chip; }}
    >
      <ChevronLeft
        size={14}
        style={{
          transform: collapsed ? 'rotate(180deg)' : 'none',
          transition: animated ? `transform ${WIDTH_MS}ms ${EASE}` : 'none',
        }}
      />
    </button>
  );
}

/**
 * A casca da barra: a largura que anima, a borda e o botão que a comanda.
 *
 * A largura é o único valor animado — texto e ícones ficam parados enquanto ela
 * corre. Animar o recuo junto faria os ícones andarem de lado, e ícone que anda
 * é ícone que se perde de vista.
 */
export function SidebarShell({ collapsed, animated, onToggle, children }) {
  return (
    <aside
      style={{
        position: 'relative', zIndex: 20, flexShrink: 0,
        width: collapsed ? SIDEBAR_RAIL : SIDEBAR_OPEN,
        minHeight: '100vh',
        background: T.bg, borderRight: `1px solid ${T.line}`,
        display: 'flex', flexDirection: 'column',
        transition: animated ? `width ${WIDTH_MS}ms ${EASE}` : 'none',
      }}
    >
      <ToggleButton collapsed={collapsed} animated={animated} onToggle={onToggle} />
      {children}
    </aside>
  );
}

/** As abas, ocupando o meio da barra. */
export function SidebarNav({ children }) {
  return (
    <nav style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {children}
    </nav>
  );
}

/** O pé: conta e saída, separados das abas pelo espaço que sobra. */
export function SidebarFooter({ children }) {
  return (
    <div style={{ padding: '0 12px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {children}
    </div>
  );
}
