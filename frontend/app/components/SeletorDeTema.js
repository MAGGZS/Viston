'use client';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { setTheme, useThemePref } from '@/app/lib/tema';
import { T } from '@/app/lib/theme';

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

/**
 * Metade da miniatura, para a prévia partida do automático.
 *
 * Medidas em porcentagem e não em pixel: a prévia acompanha a largura da
 * coluna (com proporção fixa), e um cartão de 40px dentro dela ficaria gordo no
 * telefone e magro no desktop.
 */
function Metade({ tone }) {
  const c = PREVIEW[tone];

  return (
    <span className="tema-previa__tela" style={{ width: '50%', background: c.page }}>
      <span className="tema-previa__linha" style={{ width: '80%', background: c.line }} />
      <span className="tema-previa__cartao" style={{ background: c.card }}>
        <span className="tema-previa__pilula" style={{ width: '70%' }} />
      </span>
    </span>
  );
}

/** Miniatura da interface: a página, um cartão e a pílula dourada da ação. */
function Preview({ tone }) {
  /**
   * A do automático mostra as duas, partidas ao meio.
   *
   * É a única prévia que não pode mostrar um tema só: a opção não promete claro
   * nem escuro, promete acompanhar o aparelho. Metade e metade é a imagem mais
   * curta disso, e dispensa legenda.
   */
  if (tone === 'system') {
    return (
      <span
        aria-hidden="true"
        className="tema-previa"
        style={{ display: 'flex', boxShadow: `inset 0 0 0 1px ${PREVIEW.light.ring}` }}
      >
        <Metade tone="dark" />
        <Metade tone="light" />
      </span>
    );
  }

  const c = PREVIEW[tone];

  return (
    <span
      aria-hidden="true"
      className="tema-previa tema-previa__tela"
      style={{ background: c.page, boxShadow: `inset 0 0 0 1px ${c.ring}` }}
    >
      <span className="tema-previa__linha" style={{ width: '46%', background: c.line }} />
      <span className="tema-previa__cartao" style={{ background: c.card, boxShadow: `inset 0 0 0 1px ${c.ring}` }}>
        <span className="tema-previa__pilula" style={{ width: '34%' }} />
        <span className="tema-previa__linha" style={{ width: '72%', background: c.line, marginBottom: 0 }} />
      </span>
    </span>
  );
}

function Option({ tone, label, icon: Icon, selected, onSelect }) {
  // Caixa, fio dourado, foco e toque moram em `.tema-opcao` (globals.css): o
  // tamanho da letra e o ícone mudam pela largura do seletor, e isso só uma
  // consulta de contêiner sabe fazer.
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className="tema-opcao">
      <Preview tone={tone} />
      <span className="tema-opcao__rotulo">
        <Icon size={15} strokeWidth={1.8} aria-hidden="true" className="tema-opcao__icone" />
        <span className="tema-opcao__texto">{label}</span>
      </span>
      {/* O check fica no canto da prévia, fora do fluxo: entrar ou sair não
          empurra o rótulo, e as três opções ficam com a mesma linha de texto. */}
      {selected && (
        <span className="tema-opcao__marca" aria-hidden="true">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

/**
 * A escolha do tema, onde quer que ela precise aparecer.
 *
 * No desktop, as três opções ficam à vista na seção de aparência: há espaço, e
 * a tela inteira responde ao toque sem nada por cima. No telefone, à vista elas
 * empurravam o resto da conta para baixo da dobra, então moram numa caixa que
 * abre a partir da linha "Tema" — e a caixa não esconde o resultado, que
 * aparece no app atrás dela.
 *
 * Sem botão de salvar: a troca acontece no toque e a tela por trás já responde,
 * então confirmar seria pedir para a pessoa aprovar o que ela acabou de ver.
 *
 * O fundo das opções é `T.card` porque no desktop elas vivem dentro de um
 * bloco de `T.chip` — a miniatura precisa de uma moldura que se distinga do que
 * está atrás dela, senão as duas prévias flutuam soltas no mesmo cinza. Na
 * caixa do telefone o fundo também é `T.card`, e quem separa é o `cardRing`.
 */
export function SeletorDeTema() {
  // A preferência, e não o tema em uso: com "Automático" marcado num aparelho
  // claro, o tema em uso é `light`, e guiar-se por ele acenderia "Claro" —
  // mostrando à pessoa uma escolha que ela não fez.
  const pref = useThemePref();

  return (
    // Três colunas iguais até 640px. Mais largo que isso, a miniatura viraria
    // uma faixa que não se parece mais com uma tela; mais estreito, sobra o
    // vazio à direita que o painel do desktop tinha. O texto de ajuda fica na
    // mesma medida, para o bloco terminar numa borda só.
    <div className="tema-seletor">
      <div
        role="radiogroup"
        aria-label="Tema"
        className="tema-seletor__grade"
      >
        <Option
          tone="system"
          label="Automático"
          icon={Monitor}
          selected={pref === 'system'}
          onSelect={() => setTheme('system')}
        />
        <Option
          tone="dark"
          label="Escuro"
          icon={Moon}
          selected={pref === 'dark'}
          onSelect={() => setTheme('dark')}
        />
        <Option
          tone="light"
          label="Claro"
          icon={Sun}
          selected={pref === 'light'}
          onSelect={() => setTheme('light')}
        />
      </div>

      <p style={{ color: T.mute, fontSize: 13, marginTop: 14, lineHeight: 1.5 }}>
        No automático, o Viston segue a aparência do aparelho e muda junto com ela.
        A escolha vale neste aparelho; entrando de outro, ela começa no automático de novo.
      </p>
    </div>
  );
}
