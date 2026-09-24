/**
 * Sair do app para um endereço de fora.
 *
 * Existe por dois motivos, e os dois valem a função de uma linha.
 *
 * O primeiro é o compilador do React: `window.location.href = url` é escrita
 * num objeto que ele considera congelado, e a regra `react-hooks/immutability`
 * reprova — foi o que deixou o lint vermelho na `main`. `assign()` faz
 * exatamente a mesma coisa (navega, e empilha no histórico), sem escrever em
 * nada.
 *
 * O segundo é o que essa reprovação escondia: espalhada por cinco arquivos, a
 * mesma linha ia ser reescrita errado de novo na sexta vez. Com uma porta só,
 * quem for mandar a pessoa para o Stripe ou para o download do relatório passa
 * por aqui e nem precisa saber da regra.
 *
 * Só para destino externo (checkout, portal, arquivo assinado). Navegação
 * dentro do app é do router do Next, que preserva o estado da página.
 */
export function irPara(url) {
  if (!url) return;
  window.location.assign(url);
}
