'use client';
import { useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { Logo } from '@/app/components/Logo';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { T } from '@/app/lib/theme';

/**
 * As fotos da metade direita das telas de acesso: andares corporativos — open
 * office, fileiras de mesas, baias —, o prédio comercial que o produto vistoria.
 * A tela de entrada diz para quem o produto é antes de qualquer texto.
 *
 * Arquivos em `public/auth/`, baixados do Unsplash (licença livre), e não
 * apontados para o CDN deles: o CSP só aceita imagem do próprio domínio, e a
 * tela de acesso não deve depender de terceiro para abrir.
 */
const FOTOS = ['/auth/escritorio-1.jpg', '/auth/escritorio-2.jpg', '/auth/escritorio-3.jpg'];

// Tempo de cada foto na tela. É também a duração do preenchimento da barra —
// ver `.auth-barra__fill` em globals.css, que lê o mesmo valor pela variável.
const DURACAO_MS = 6500;

/*
 * A largura que o navegador deve buscar de cada foto.
 *
 * Não é "meia janela": a foto é 3:2 em `cover` num painel quase quadrado e de
 * altura cheia, então quem manda é a altura — o recorte usa ~1,5x a altura do
 * painel em largura, e o zoom do Ken Burns pede um pouco mais. Com `50vw` o
 * navegador escolhia uma cópia estreita e esticava, e a foto saía borrada.
 *
 * Abaixo de 900px o painel é `display: none`: `1px` faz o navegador escolher a
 * menor cópia do `srcset`, e o telefone não paga pela foto que não mostra.
 */
const SIZES = '(min-width: 900px) 160vh, 1px';

const S = {
  // A logo vai monocromática: o "V" e o traço amarelo da marca brigariam com o
  // dourado do filtro. `brightness(0) invert(1)` leva todo traço a branco sem
  // precisar de uma variante nova do desenho.
  logo: {
    position: 'absolute', top: 28, right: 28, zIndex: 2,
    opacity: 0.85,
    filter: 'brightness(0) invert(1)',
    pointerEvents: 'none',
  },
};

/*
 * A aba está escondida? Lido como fonte externa, igual ao `useMediaQuery`: o
 * `visibilitychange` avisa, o snapshot responde, e a inscrição sai sozinha
 * quando o componente desmonta.
 *
 * Serve para pausar o carrossel numa aba de fundo. Sem isto, quem volta à aba
 * depois de um tempo encontra a barra no meio de uma foto que nunca viu
 * começar — o navegador segura os quadros, mas não em todo caso.
 */
function inscreverVisibilidade(onChange) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}
const abaOculta = () => document.visibilityState === 'hidden';
const abaOcultaNoServidor = () => false;

/*
 * Já hidratou? `false` no HTML do servidor, `true` no cliente.
 *
 * A barra só começa a encher depois disto. Ela é o relógio da troca, e o
 * `animationend` que a dispara só tem quem o ouça depois da hidratação: num
 * aparelho lento, uma barra que começasse no HTML do servidor podia terminar
 * antes do React chegar, e o carrossel ficaria parado na primeira foto para
 * sempre. O zoom da foto não depende de ninguém ouvir, então começa já.
 */
const nadaAInscrever = () => () => {};
const noCliente = () => true;
const noServidor = () => false;

export function AuthCarrossel() {
  const [ativa, setAtiva] = useState(0);
  // A foto que acabou de sair. Ela mantém a classe do zoom enquanto apaga: a
  // animação segue de onde estava em vez de voltar ao tamanho de origem no
  // meio do cruzamento — ver `.auth-slide.is-saindo` em globals.css.
  const [saindo, setSaindo] = useState(null);
  // Conta as trocas, não só o índice: clicar no segmento que já está ativo
  // tem de reiniciar o preenchimento, e a `key` só muda se algo mudar.
  const [volta, setVolta] = useState(0);
  // Com menos movimento pedido, nada anda sozinho: a foto fica até a pessoa
  // escolher outra. Sem isto, a regra global de `globals.css` encurta a
  // animação da barra para 0,01ms e o `animationend` trocaria de foto em
  // laço, sem parar.
  const reduzir = useMediaQuery('(prefers-reduced-motion: reduce)');
  const oculta = useSyncExternalStore(inscreverVisibilidade, abaOculta, abaOcultaNoServidor);
  const hidratado = useSyncExternalStore(nadaAInscrever, noCliente, noServidor);

  function irPara(i) {
    if (i !== ativa) setSaindo(ativa);
    setAtiva(i);
    setVolta((v) => v + 1);
  }

  function avancar() {
    // Confere a preferência na hora, e não só pelo `reduzir`: na hidratação o
    // hook ainda responde `false` (é o valor do servidor), e a animação
    // encurtada pela regra global terminaria antes dele se corrigir.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    irPara((ativa + 1) % FOTOS.length);
  }

  function classeDaFoto(i) {
    if (i === ativa) return 'auth-slide is-ativa';
    if (i === saindo) return 'auth-slide is-saindo';
    return 'auth-slide';
  }

  // Um invólucro só para as duas pausas — passar o mouse ou o foco por cima do
  // painel (`:hover`/`:focus-within`, no CSS) e a aba escondida (a classe). As
  // duas param a barra e o zoom juntos: pausar um sem o outro deixaria a foto
  // andando enquanto o relógio da troca está parado.
  return (
    <div className={`auth-carrossel${oculta ? ' is-pausado' : ''}`}>
      {/* As fotos e a logo são superfície: `aria-hidden` no conjunto. Quem
          navega pelo leitor de tela só encontra a barra, que é a única parte
          que faz alguma coisa. */}
      <div aria-hidden="true">
        {FOTOS.map((src, i) => (
          <div key={src} className={classeDaFoto(i)}>
            <Image
              src={src}
              alt=""
              fill
              sizes={SIZES}
              // A primeira pede prioridade porque é a que pinta a tela. As
              // outras são `lazy` só no nome: estão empilhadas no mesmo lugar,
              // dentro da janela, então o navegador as baixa logo em seguida —
              // e é bom que baixe, senão a troca mostraria um quadro vazio.
              // `eager` e não `preload`: com o `sizes` de 1px no telefone, a
              // cópia que ele baixa lá é mínima.
              {...(i === 0 ? { loading: 'eager', fetchPriority: 'high' } : {})}
              className="auth-slide__img"
            />
          </div>
        ))}

        {/* O véu dourado-escuro mora por cima de todas as fotos, e não em cada
            uma: na troca as duas imagens cruzam sob o mesmo filtro, sem
            piscar. */}
        <div className="auth-slide__veu" />

        <div style={S.logo}>
          <Logo size={16} variant="horizontal" />
        </div>
      </div>

      {/* Estilo stories: as passadas cheias, a da vez enchendo, as próximas
          vazias. Cada segmento é um botão — dá para pular para a foto. */}
      <div
        className="auth-barra"
        role="group"
        aria-label="Fotos do painel"
        style={{ '--auth-foto-ms': `${DURACAO_MS}ms` }}
      >
        {FOTOS.map((src, i) => {
          // Antes da hidratação a da vez fica vazia — ver `noCliente` acima.
          const estado = i < ativa ? 'cheia' : i === ativa ? (hidratado ? 'ativa' : 'vazia') : 'vazia';
          return (
            <button
              key={src}
              type="button"
              className="auth-barra__seg"
              aria-label={`Mostrar foto ${i + 1} de ${FOTOS.length}`}
              aria-current={i === ativa ? 'true' : undefined}
              onClick={() => irPara(i)}
            >
              <span className="auth-barra__trilho">
                <span
                  key={i === ativa ? `a${volta}` : estado}
                  className={`auth-barra__fill is-${estado}${reduzir ? ' is-parada' : ''}`}
                  data-testid={i === ativa ? 'auth-barra-ativa' : undefined}
                  style={{ background: T.accent }}
                  onAnimationEnd={i === ativa && !reduzir ? avancar : undefined}
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
