/**
 * O mapa do ícone "?": qual tutorial cada tela principal abre.
 *
 * Num arquivo só, e não espalhado pelas telas, porque é uma decisão de conteúdo
 * e não de código: quando o roteiro (tutoriais/roteiros.md) ganha, renomeia ou
 * tira uma funcionalidade, é aqui que se confere se o "?" de alguma tela ficou
 * apontando para o lugar errado. As chaves são o `pasta` e o `id` do
 * `tutoriais/catalogo.json`, os mesmos da URL da central.
 *
 * O critério de escolha foi a pergunta que a pessoa tem quando está naquela
 * tela, e não o tutorial mais completo da pasta. No painel do prédio, o gestor
 * quer saber o que os números dizem (acompanhar a operação), e não como criou
 * o prédio que já existe.
 *
 * Quando o tutorial ainda não foi publicado, a central responde 404 e a tela da
 * funcionalidade leva à pasta dele com um aviso (ver app/ajuda/[pasta]/
 * [funcionalidade]/page.js). O "?" nunca leva a uma tela quebrada, então ele
 * pode aparecer antes de o vídeo existir.
 *
 * Telas fora do mapa não têm "?" de propósito: a central inteira continua a um
 * toque, pela linha "Ajuda e tutoriais" do Perfil. As telas do admin ficam de
 * fora por decisão do proprietário: o ADMIN não tem tutorial.
 */
export const AJUDA_POR_TELA = {
  // Inspetor, no celular.
  'inspetor.vistoria': { pasta: 'inspetor', funcionalidade: 'inspetor-vistoria-completa', tela: '/inspecao' },
  'inspetor.historico': { pasta: 'inspetor', funcionalidade: 'inspetor-historico', tela: '/historico' },

  // Responsável: a fila no celular e a mesa no computador.
  'responsavel.fila': { pasta: 'responsavel', funcionalidade: 'responsavel-receber-chamado', tela: '/responsavel' },
  'responsavel.chamados': { pasta: 'responsavel', funcionalidade: 'responsavel-trabalhar-chamado', tela: '/responsavel/chamados' },

  // Moderador, no computador.
  'moderador.painel': { pasta: 'moderador', funcionalidade: 'moderador-painel', tela: '/moderador' },
  'moderador.analitico': { pasta: 'moderador', funcionalidade: 'moderador-painel-analitico', tela: '/moderador/dashboard' },

  // Gestor, no computador.
  'gestor.predios': { pasta: 'gestor', funcionalidade: 'gestor-criar-conta-predio', tela: '/gestor' },
  'gestor.predio': { pasta: 'gestor', funcionalidade: 'gestor-acompanhar-operacao', tela: '/gestor/predios/[id]' },
  'gestor.colaboradores': { pasta: 'gestor', funcionalidade: 'gestor-equipe', tela: '/gestor/predios/[id]/colaboradores' },

  // Visualizador, no computador.
  'visualizador.calendario': { pasta: 'visualizador', funcionalidade: 'visualizador-calendario', tela: '/desktop/visualizacao' },
};

/** O endereço que o "?" de uma tela abre, ou `null` se a tela não está no mapa. */
export function linkDaAjuda(contexto) {
  const alvo = AJUDA_POR_TELA[contexto];
  if (!alvo) return null;
  return `/ajuda/${alvo.pasta}/${alvo.funcionalidade}`;
}
