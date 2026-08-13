/**
 * O que a pessoa pode fazer — lido dos vínculos, nunca de um papel na conta.
 *
 * `user.role` responde uma pergunta só: é o ADMIN do sistema? Todo o resto —
 * gerir, vistoriar, só acompanhar — depende de qual prédio se está olhando, e
 * vem de `user.memberships`, que a API entrega no login e em `/users/me`.
 *
 * A mesma conta pode ser gestora de um prédio e visualizadora de outro. É por
 * isso que quase toda função aqui aceita um `buildingId`: perguntar "o que essa
 * pessoa é" sem dizer onde não tem resposta.
 */

export function isAdmin(user) {
  return user?.role === 'ADMIN';
}

export function memberships(user) {
  return user?.memberships ?? [];
}

/**
 * Papel da pessoa naquele prédio: 'GESTOR', 'INSPECTOR', 'VIEWER' ou null.
 * O ADMIN passa por todos como gestor — é a conta de suporte do sistema.
 */
export function roleIn(user, buildingId) {
  if (isAdmin(user)) return 'GESTOR';
  if (!buildingId) return null;
  return memberships(user).find((m) => m.building_id === buildingId)?.role ?? null;
}

/** Os prédios que a pessoa administra. */
export function managedBuildings(user) {
  return memberships(user).filter((m) => m.role === 'GESTOR');
}

/** Administra ao menos um prédio — é o que manda a pessoa para a área do gestor. */
export function isManager(user) {
  return isAdmin(user) || managedBuildings(user).length > 0;
}

export function managesBuilding(user, buildingId) {
  return roleIn(user, buildingId) === 'GESTOR';
}

/**
 * Pode vistoriar. Com prédio, é o papel naquele prédio; sem prédio, é se existe
 * algum em que ela vistorie.
 */
export function canInspect(user, buildingId) {
  if (buildingId) {
    const role = roleIn(user, buildingId);
    return role === 'GESTOR' || role === 'INSPECTOR';
  }
  return isAdmin(user) || memberships(user).some((m) => m.role !== 'VIEWER');
}

/**
 * Só acompanha, em todo lugar onde está.
 *
 * É a conta que não abre no telefone (ver RouteGuard): o produto dela é a tela
 * larga. Quem ainda não tem vínculo nenhum não entra aqui — essa pessoa usa o
 * app normalmente até se vincular a algum prédio.
 */
export function isViewerOnly(user) {
  if (isAdmin(user)) return false;
  const list = memberships(user);
  return list.length > 0 && list.every((m) => m.role === 'VIEWER');
}

/** Ainda não está em prédio nenhum. */
export function hasNoBuilding(user) {
  return !isAdmin(user) && memberships(user).length === 0;
}

/**
 * Os papéis que a pessoa ocupa, para as guardas de rota que pensam por papel
 * ('quem vistoria em algum lugar entra aqui'). Quem não tem vínculo responde
 * 'NONE', que é o estado da conta recém-criada.
 */
export function effectiveRoles(user) {
  if (isAdmin(user)) return ['ADMIN'];
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
 * Como a função aparece no perfil e na lista do admin.
 *
 * Com vínculos em papéis diferentes, mostra o de maior alcance: é o que a
 * pessoa reconhece como "o que eu sou aqui". O prédio específico, quando
 * importa, a tela já mostra ao lado.
 */
export function roleLabel(user) {
  if (isAdmin(user)) return LABELS.ADMIN;

  const roles = memberships(user).map((m) => m.role);
  for (const role of ['GESTOR', 'INSPECTOR', 'VIEWER']) {
    if (roles.includes(role)) return LABELS[role];
  }
  return 'Sem vínculo';
}

/** Mesma leitura, para a lista do admin, que recebe só os papéis. */
export function rolesLabel(buildingRoles = [], accountRole) {
  if (accountRole === 'ADMIN') return LABELS.ADMIN;
  for (const role of ['GESTOR', 'INSPECTOR', 'VIEWER']) {
    if (buildingRoles.includes(role)) return LABELS[role];
  }
  return 'Sem vínculo';
}
