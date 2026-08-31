'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * As telas da barra inferior, na ordem em que elas aparecem lá.
 *
 * É esta ordem que dá sentido a "o lado": ir para uma tela mais à direita na
 * barra traz a nova tela pela direita, e voltar traz pela esquerda. O
 * movimento só ajuda se acompanhar o dedo — trocado, ele mente sobre onde a
 * pessoa está.
 *
 * A lista tem as quatro entradas, e não as três de quem não atende chamado: o
 * responsável vê `/responsavel` entre a home e o histórico, e tirá-la para os
 * outros não muda a ordem relativa do que sobra. Uma lista só serve aos dois
 * casos.
 *
 * Ela precisa continuar igual à da `BottomNav` — há um teste que compara as
 * duas, porque a divergência não daria erro nenhum: só inverteria o lado de
 * onde a tela entra, e ninguém desconfiaria da lista.
 */
export const ORDEM_TELAS = ['/home', '/responsavel', '/historico', '/perfil'];

/**
 * De onde se veio, guardado fora do React.
 *
 * Tem de sobreviver à troca de tela, e é justamente aí que todo estado de
 * componente morre: quem sai é desmontado antes de quem entra ser montado.
 * Como variável de módulo, ela vive enquanto a aba viver e some no recarregar
 * — que é o comportamento certo, porque uma tela aberta do zero não veio de
 * lado nenhum.
 */
let telaAnterior = null;

/**
 * A classe de entrada da tela: de que lado ela desliza.
 *
 * Vazia quando não há de onde vir — primeira tela da sessão —, quando a tela
 * não está na barra (uma vistoria, um chamado aberto: entrar nelas é descer um
 * nível, não andar de lado) e quando se chega à mesma tela em que já se estava.
 *
 * A decisão é tomada uma vez, na montagem, e não a cada render: o `pathname`
 * não muda enquanto a tela vive, e recalcular depois que `telaAnterior` já
 * avançou daria uma classe diferente no meio da animação.
 */
export function useDirecaoDaTela() {
  const pathname = usePathname();
  const indice = ORDEM_TELAS.indexOf(pathname);

  const [classe] = useState(() => {
    if (indice < 0 || telaAnterior === null || telaAnterior === indice) return '';
    return indice > telaAnterior ? 'anim-slide-from-right' : 'anim-slide-from-left';
  });

  useEffect(() => {
    if (indice >= 0) telaAnterior = indice;
  }, [indice]);

  return classe;
}

/** Só para os testes: devolve o módulo ao estado de quem acabou de abrir o app. */
export function esquecerTelaAnterior() {
  telaAnterior = null;
}
