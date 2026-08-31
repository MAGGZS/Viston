'use client';
import { useEffect, useRef, useState } from 'react';
import { T, R, W, NUM } from '@/app/lib/theme';

const CASAS = 6;

const S = {
  campo: { display: 'flex', flexDirection: 'column', gap: 10 },
  rotulo: { fontSize: 12, fontWeight: W.body, color: T.mute },
  /**
   * A fileira encolhe junto com a tela.
   *
   * `gap` fixo e caixas em `flex: 1` porque seis quadrados de largura fixa não
   * cabem num telefone estreito — a 320px eles estourariam a coluna e o último
   * sairia da tela. `aspectRatio` mantém cada uma proporcional enquanto a
   * largura muda.
   */
  fileira: { display: 'flex', gap: 8, width: '100%' },
  casa: {
    flex: 1,
    minWidth: 0,
    aspectRatio: '1 / 1.2',
    background: T.chip,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    // `R.card` e não `R.control`: 16 numa caixa de ~55px arredonda quase até o
    // círculo, e o campo perde a leitura de "casa" que a grade precisa ter.
    borderRadius: R.card,
    color: T.text,
    // Poppins, e não monoespaçada. Um dígito por caixa não tem coluna para
    // alinhar, então o monoespaçado não compra nada — e traz o desenho do
    // Courier, que é estranho a tudo mais no produto. `tabular-nums` fica
    // porque os dígitos da Poppins têm larguras diferentes, e sem ele o 1
    // dança dentro da própria casa.
    fontFamily: T.display,
    fontWeight: W.title,
    fontSize: 26,
    ...NUM,
    textAlign: 'center',
    outline: 'none',
    padding: 0,
    // O Safari do iOS desenha uma moldura nativa por cima do nosso raio.
    appearance: 'none',
    WebkitAppearance: 'none',
    transition: 'border-color 120ms ease, background 120ms ease',
  },
  casaPreenchida: { borderColor: T.line },
  /**
   * O foco precisa aparecer, e `outline: none` sozinho o apaga.
   *
   * Sem isto quem navega por teclado não sabe em que casa está — e numa fileira
   * de seis quadrados iguais essa é a única pista. A borda dourada é a mesma
   * cor que o produto usa para "aqui", e `accent` como borda é `background`,
   * não letra: a regra do tema segue valendo.
   */
  casaFocada: { borderColor: T.accent, background: T.hover },
  casaErro: { borderColor: T.danger },
};

/**
 * Os seis dígitos, um por caixa.
 *
 * Uma caixa por dígito porque aqui o gesto é digitar, e não copiar de volta:
 * conferir seis números contra o e-mail é mais fácil quando eles estão
 * separados. No corpo do e-mail a decisão é a oposta — lá é uma string só,
 * porque copiar de seis células devolveria `4 8 1 5 0 7`, com espaços que este
 * campo recusa.
 *
 * O estado continua sendo uma string única no pai. As caixas são só a
 * apresentação: `valor[i]` desenha cada uma, e toda edição volta como string
 * inteira. Guardar seis pedaços separados obrigaria cada tela a remontá-los, e
 * é onde costuma nascer o caso do dígito que some.
 *
 * Sem `autoFocus`: roubar o foco no carregamento atropela quem navega por
 * teclado e faz o leitor de tela começar no meio da página, sem o título nem a
 * explicação de para que serve o campo. A regra `jsx-a11y/no-autofocus` do
 * projeto cobra isso.
 */
export function CodigoInput({ valor, aoMudar, erro, rotulo = 'Código de 6 dígitos' }) {
  const refs = useRef([]);
  const [focada, setFocada] = useState(-1);

  /**
   * O valor de agora, e não o do último render.
   *
   * `aoMudar` é assíncrono: digitando depressa, a segunda tecla chega antes do
   * re-render e o `valor` da prop ainda é o anterior. Sem este espelho, digitar
   * `481507` guardava só um dígito — cada tecla partia de um estado velho e
   * sobrescrevia a anterior.
   */
  const agora = useRef(valor);

  // A sincronia mora num efeito, e não no corpo do componente: escrever em ref
  // durante o render quebra as garantias do render concorrente, e a regra
  // `react-hooks/refs` do projeto cobra isso. Aqui ela cobre só a mudança que
  // vem de fora — quem digita já atualiza o ref pelo `aplicar`, na hora.
  useEffect(() => {
    agora.current = valor;
  }, [valor]);

  function aplicar(novo) {
    agora.current = novo;
    aoMudar(novo);
  }

  const focar = (i) => {
    const alvo = refs.current[Math.max(0, Math.min(CASAS - 1, i))];
    alvo?.focus();
    alvo?.select();
  };

  /**
   * Escreve a partir da casa `i` e anda para a frente.
   *
   * O código é sempre contíguo: não existe estado com a casa 1 vazia e a 3
   * preenchida, porque a string que o pai guarda não sabe representar buraco.
   * Escrever além do fim é tratado como escrever no fim — é o que acontece
   * quando alguém clica na última casa de um campo vazio.
   */
  function digitar(i, entrada) {
    const digitos = entrada.replace(/\D/g, '');
    if (!digitos) return;

    const atual = agora.current;
    const inicio = Math.min(i, atual.length);
    const casas = atual.split('');
    for (let k = 0; k < digitos.length && inicio + k < CASAS; k += 1) {
      casas[inicio + k] = digitos[k];
    }

    const novo = casas.join('').slice(0, CASAS);
    aplicar(novo);
    focar(inicio + digitos.length);
  }

  function aoTeclar(i, e) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const atual = agora.current;

      if (atual[i]) {
        // Apaga o dígito desta casa. Remover em vez de esvaziar mantém a string
        // contígua: um vazio no meio viraria buraco, e buraco a string não tem
        // como guardar.
        aplicar(atual.slice(0, i) + atual.slice(i + 1));
        return;
      }
      // Casa vazia: apaga a anterior e recua. É o que o dedo espera de um
      // backspace repetido, e sem isto ele trava na primeira casa vazia.
      if (i > 0) {
        aplicar(atual.slice(0, i - 1) + atual.slice(i));
        focar(i - 1);
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focar(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focar(i + 1);
    }
  }

  /**
   * Colar preenche a fileira inteira, e não só a casa clicada.
   *
   * É o que quebra a maioria das implementações de seis caixas: sem isto,
   * colar `481507` põe `4` numa casa e descarta o resto — e colar é
   * exatamente o que quem lê o código no mesmo aparelho vai fazer. O filtro
   * de não-dígitos aceita `481 507` e `481-507` do jeito que o e-mail
   * eventualmente os quebre.
   */
  function aoColar(e) {
    const digitos = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CASAS);
    if (!digitos) return;
    e.preventDefault();
    aplicar(digitos);
    focar(digitos.length);
  }

  return (
    <div style={S.campo}>
      {/* `fieldset`/`legend` de verdade: seis campos são um grupo, e sem isso o
          leitor de tela anuncia "caixa de edição" seis vezes, sem dizer de quê. */}
      {/*
        `minWidth: 0` não é enfeite: o estilo do navegador dá ao `fieldset` um
        `min-inline-size: min-content`, e ele é o único elemento que se recusa a
        encolher abaixo do conteúdo. Sem esta linha o min-content de seis
        `<input>` é a largura padrão deles — o campo media 2128px, cada casa
        348×418, e a página ganhava barra de rolagem horizontal. O `minWidth: 0`
        das próprias casas não resolve, porque quem não cede é o pai.
      */}
      <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0, minInlineSize: 0 }}>
        <legend style={{ ...S.rotulo, padding: 0, marginBottom: 10 }}>{rotulo}</legend>

        <div style={S.fileira}>
          {Array.from({ length: CASAS }, (_, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              // Só a primeira anuncia `one-time-code`: repetir em todas faz o
              // iOS oferecer o preenchimento seis vezes, uma por casa.
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={valor[i] ?? ''}
              onChange={(e) => digitar(i, e.target.value)}
              onKeyDown={(e) => aoTeclar(i, e)}
              onPaste={aoColar}
              onFocus={(e) => {
                setFocada(i);
                e.target.select();
              }}
              onBlur={() => setFocada((atual) => (atual === i ? -1 : atual))}
              aria-label={`Dígito ${i + 1} de ${CASAS}`}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? 'codigo-erro' : undefined}
              style={{
                ...S.casa,
                ...(valor[i] ? S.casaPreenchida : {}),
                ...(erro ? S.casaErro : {}),
                // O foco fala por último: numa fileira de seis quadrados iguais
                // ele é a única pista de onde a digitação vai cair.
                ...(focada === i ? S.casaFocada : {}),
              }}
            />
          ))}
        </div>
      </fieldset>

      {erro && (
        <span id="codigo-erro" role="alert" style={{ fontSize: 12, color: T.danger }}>
          {erro}
        </span>
      )}
    </div>
  );
}
