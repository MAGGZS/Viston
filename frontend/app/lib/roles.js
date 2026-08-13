/**
 * O que a conta é — e o que ela pode fazer em cada prédio.
 *
 * O sistema tem dois tipos de conta, em tabelas diferentes:
 *
 *   MANAGER  gestor. Cadastra prédios e administra quem entra neles. Não
 *            vistoria: o relatório aponta para a tabela de usuários, e ele não
 *            está lá.
 *   USER     todo o resto. Sem papel na conta; o que ela pode fazer vem do
 *            vínculo com cada prédio (INSPECTOR ou VIEWER). O ADMIN é um USER
 *            com `role: 'ADMIN'` — conta de suporte, sem prédio próprio.
 *
 * `user.kind` diz o tipo, e `user.memberships` traz os prédios: para o gestor,
 * os que ele administra (papel 'GESTOR'); para o usuário, os vínculos dele.
 * Os dois chegam no mesmo formato de propósito, para as telas não bifurcarem.
 */

export function isManagerAccount(user) {
  return user?.kind === 'MANAGER';
}

export function isAdmin(user) {
  return user?.kind !== 'MANAGER' && user?.role === 'ADMIN';
}

export function memberships(user) {
  return user?.memberships ?? [];
}

/**
 * Papel da conta naquele prédio: 'GESTOR', 'INSPECTOR', 'VIEWER' ou null.
 * O ADMIN passa por todos como gestor — é a conta de suporte do sistema.
 */
export function roleIn(user, buildingId) {
  if (isAdmin(user)) return 'GESTOR';
  if (!buildingId) return null;
  return memberships(user).find((m) => m.building_id === buildingId)?.role ?? null;
}

/** Os prédios que a conta administra. Só gestor e admin têm algum. */
export function managedBuildings(user) {
  return memberships(user).filter((m) => m.role === 'GESTOR');
}

/**
 * É uma conta de gestão — a que tem a área própria, sem barra inferior.
 *
 * Vale para o gestor mesmo sem prédio nenhum: a conta recém-criada precisa
 * chegar à tela que a deixa cadastrar o primeiro.
 */
export function isManager(user) {
  return isManagerAccount(user) || isAdmin(user);
}

export function managesBuilding(user, buildingId) {
  return roleIn(user, buildingId) === 'GESTOR';
}

/**
 * Pode vistoriar.
 *
 * Nunca o gestor: a vistoria é assinada por uma conta de usuário, e ele não é
 * uma. Com prédio, é o papel naquele prédio; sem prédio, é se existe algum em
 * que ela vistorie.
 */
export function canInspect(user, buildingId) {
  if (isManagerAccount(user)) return false;
  if (isAdmin(user)) return true;

  if (buildingId) return roleIn(user, buildingId) === 'INSPECTOR';
  return memberships(user).some((m) => m.role === 'INSPECTOR');
}

/**
 * Só acompanha, em todo lugar onde está.
 *
 * É a conta que não abre no telefone (ver RouteGuard): o produto dela é a tela
 * larga. Quem ainda não tem vínculo nenhum não entra aqui — essa pessoa usa o
 * app normalmente até se vincular a algum prédio.
 */
export function isViewerOnly(user) {
  if (isManagerAccount(user) || isAdmin(user)) return false;
  const list = memberships(user);
  return list.length > 0 && list.every((m) => m.role === 'VIEWER');
}

/** Ainda não está em prédio nenhum. */
export function hasNoBuilding(user) {
  return !isAdmin(user) && memberships(user).length === 0;
}

/**
 * Os papéis que a conta ocupa, para as guardas de rota que pensam por papel
 * ('quem vistoria em algum lugar entra aqui'). Quem não tem vínculo responde
 * 'NONE', que é o estado da conta recém-criada.
 */
export function effectiveRoles(user) {
  if (isAdmin(user)) return ['ADMIN'];
  if (isManagerAccount(user)) return ['GESTOR'];

  const roles = [...new Set(memberships(user).map((m) => m.role))];
  return roles.length > 0 ? roles : ['NONE'];
}

const LABELS = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  INSPECTOR: 'Inspetor',
  VIEWER: 'Visualizador',
};

/**
 * Como a função aparece no perfil.
 *
 * Para o gestor a resposta é o tipo da conta, e não um papel de prédio. Para o
 * usuário com vínculos em papéis diferentes, mostra o de maior alcance — é o
 * que a pessoa reconhece como "o que eu sou aqui".
 */
export function roleLabel(user) {
  if (isAdmin(user)) return LABELS.ADMIN;
  if (isManagerAccount(user)) return LABELS.GESTOR;

  const roles = memberships(user).map((m) => m.role);
  for (const role of ['INSPECTOR', 'VIEWER']) {
    if (roles.includes(role)) return LABELS[role];
  }
  return 'Sem vínculo';
}

/** Mesma leitura, para a lista do admin, que recebe só os papéis. */
export function rolesLabel(buildingRoles = [], accountRole) {
  if (accountRole === 'ADMIN') return LABELS.ADMIN;
  for (const role of ['INSPECTOR', 'VIEWER']) {
    if (buildingRoles.includes(role)) return LABELS[role];
  }
  return 'Sem vínculo';
}

/**
 * Prefixo da API para as rotas de conta própria.
 *
 * Perfil, senha e foto existem para os dois tipos, em caminhos diferentes —
 * `/users/me` e `/managers/me` —, porque são tabelas diferentes.
 */
export function accountPath(user) {
  return isManagerAccount(user) ? '/managers/me' : '/users/me';
}
