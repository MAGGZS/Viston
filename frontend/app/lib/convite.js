/**
 * O destino de volta que as telas de acesso aceitam em `?redirect=`.
 *
 * Só caminho interno. Três barreiras, uma atrás da outra:
 * - começa com uma barra;
 * - nenhum caractere de controle (U+0000 a U+001F e U+007F) nem barra
 *   invertida. O navegador apaga TAB, CR e LF de dentro da URL e lê a barra
 *   invertida como barra comum, então "/<TAB>/site.com" e "/\site.com" viram
 *   "//site.com", que é um domínio, não uma pasta;
 * - montada sobre a origem atual, a URL continua nessa mesma origem.
 *
 * Devolve só caminho, busca e âncora da URL já interpretada, nunca o texto cru.
 * No servidor não há `window`; a base fixa ali serve apenas para o parse.
 * Era a mesma conta repetida no login e no cadastro; mora aqui para as duas
 * telas e quem mais precisar dela concordarem.
 */
const PROIBIDOS = /[\u0000-\u001F\u007F\\]/;

export function redirectSeguro(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || PROIBIDOS.test(raw)) return null;
  const origem = typeof window !== 'undefined' ? window.location.origin : 'http://viston.invalid';
  try {
    const url = new URL(raw, origem);
    if (url.origin !== origem) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/**
 * Quem está voltando para um convite de prédio (`/conectar`, aberto pelo link
 * ou pelo QR Code).
 *
 * Essa pessoa vai pedir acesso a um prédio que outra pessoa administra, e a
 * conta certa para isso é sempre a comum: conta de gestor não pede acesso (o
 * servidor recusa). Por isso, nesse caminho, as telas de entrada e de cadastro
 * escondem o atalho para o cadastro de gestor. Com ele à vista, quem estava
 * com pressa escolhia "gestor" por soar mais importante e travava no passo
 * seguinte, com uma conta que não servia para o convite.
 */
export function vemDoConvite(redirect) {
  return typeof redirect === 'string' && /^\/conectar(\?|\/|$)/.test(redirect);
}
