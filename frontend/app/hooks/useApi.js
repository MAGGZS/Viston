'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api from '@/app/lib/api';
import { HISTORY_PAGE_SIZE } from '@/app/lib/pagination';
import { useAuthStore } from '@/app/store/auth';

/**
 * Uma página de cada vez, e a página mora aqui dentro.
 *
 * As três listagens de histórico eram `useInfiniteQuery` com "Carregar mais",
 * e o botão empilhava página sobre página até o cartão ficar mais alto que a
 * tela — a coluna ao lado, com calendário e contadores, acabava pendurada num
 * vazio. Aqui a lista tem tamanho fixo e as setas do rodapé andam por ela.
 *
 * `placeholderData` segura a página anterior enquanto a próxima chega: sem
 * isso, cada clique pisca uma tabela vazia e o cartão sanfona de altura.
 *
 * A página volta para a primeira quando o que se está listando muda — outro
 * prédio, outro filtro. Sem isso, quem estava na página 3 de um prédio com
 * trinta vistorias trocava para um com cinco e via um cartão vazio, sem
 * entender por quê. O ajuste é feito no próprio render, como no
 * `useExitTransition`: num efeito, o cartão vazio chegaria a aparecer.
 */
function usePagedList({ queryKey, url, params, pick, enabled = true, pageSize = HISTORY_PAGE_SIZE }) {
  const [page, setPage] = useState(1);

  const scope = JSON.stringify(queryKey);
  const [lastScope, setLastScope] = useState(scope);
  if (scope !== lastScope) {
    setLastScope(scope);
    setPage(1);
  }

  const query = useQuery({
    // O tamanho entra na chave: a mesma lista aberta no cartão e na tela
    // ampliada pede oito e vinte linhas da mesma URL, e sem isto a segunda
    // leria do cache da primeira.
    queryKey: [...queryKey, 'tamanho', pageSize, 'page', page],
    queryFn: () =>
      api
        .get(url, { params: { ...params, page, limit: pageSize } })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
    enabled,
  });

  const rows = query.data ? pick(query.data) : [];

  /**
   * A página pedida ainda não chegou.
   *
   * `isPlaceholderData` é verdadeiro exatamente enquanto o que `query.data`
   * devolve é a página anterior, segurada pelo `keepPreviousData`. Ela ficava
   * na tela durante a espera, e o clique na seta parecia não ter feito nada até
   * o texto trocar no lugar — pior ainda entre duas páginas parecidas, onde não
   * dá para saber se o que se está lendo é o novo ou o velho.
   *
   * Só a troca de página levanta esta bandeira. Uma recarga em segundo plano da
   * mesma página mantém a chave da consulta, e o que está na tela continua
   * sendo a resposta certa — piscar esqueleto ali seria ruído.
   */
  const isPaging = query.isPlaceholderData;
  const isFirstLoad = enabled && query.isLoading;

  /**
   * As linhas de espera a desenhar enquanto a página não chega.
   *
   * Na troca de página são tantas quantas as da página que está saindo: é o que
   * mantém o cartão na mesma altura, e o calendário ao lado parado. Na primeira
   * carga não há de onde tirar esse número, e três bastam para dizer que vem
   * coisa vindo.
   */
  const placeholders =
    isFirstLoad || isPaging
      ? Array.from({ length: isPaging ? Math.max(rows.length, 1) : 3 }, (_, i) => i)
      : [];

  return {
    rows,
    total: query.data?.total ?? 0,
    pages: query.data?.pages ?? 0,
    page,
    pageSize,
    isLoading: isFirstLoad,
    isFetching: query.isFetching,
    isPaging,
    placeholders,
    prev: () => setPage((p) => Math.max(1, p - 1)),
    next: () => setPage((p) => (query.data?.pages ? Math.min(query.data.pages, p + 1) : p)),
  };
}

/**
 * Recarrega o perfil depois de uma mudança que mexe nos vínculos de quem está
 * logado — criar prédio, excluir prédio, sair de um, trocar o próprio papel.
 *
 * Sem isto o app continuaria decidindo pelo estado antigo: quem acabou de criar
 * o primeiro prédio ainda não constaria como gestor dele, e a tela inicial
 * mandaria a pessoa para o lugar errado até o próximo carregamento.
 *
 * Falha em silêncio de propósito: a operação principal já deu certo, e o
 * AuthProvider recarrega o perfil na próxima abertura.
 */
function refreshProfile() {
  return api
    .get('/auth/me')
    .then(({ data }) => useAuthStore.getState().setUser(data))
    .catch(() => {});
}

/**
 * Caminho da conta própria: gestor e usuário são tabelas diferentes, e perfil,
 * senha e foto de cada um vivem em rotas diferentes.
 */
function accountPath() {
  return useAuthStore.getState().user?.kind === 'MANAGER' ? '/managers/me' : '/users/me';
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export function useLogin() {
  return useMutation({
    mutationFn: (data) => api.post('/auth/login', data).then((r) => r.data),
  });
}

// ── Users ─────────────────────────────────────────────────────────────────────
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((r) => r.data),
  });
}

export function useUsers(page = 1) {
  return useQuery({
    queryKey: ['users', page],
    queryFn: () => api.get('/users', { params: { page, limit: 20 } }).then((r) => r.data),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/users', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

// Cadastro de gestor. Cria a conta na tabela de gestores — é outro tipo de
// conta, não um usuário com uma marca a mais.
export function useCreateManager() {
  return useMutation({
    mutationFn: (data) => api.post('/managers', data).then((r) => r.data),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/users/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.patch(accountPath(), data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

// Foto de perfil — sobe já recortada pelo app, como data URL
export function useUpdateAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (image) => api.patch(`${accountPath()}/avatar`, { image }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useRemoveAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`${accountPath()}/avatar`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data) => api.patch(`${accountPath()}/password`, data).then((r) => r.data),
  });
}

export function useDeleteMe() {
  return useMutation({
    mutationFn: () => api.delete(accountPath()).then((r) => r.data),
  });
}

// ── Feedback ──────────────────────────────────────────────────────────────────
// A caixa do admin e os envios de quem usa o app. Serve as duas naturezas de
// conta: gestor e usuário mandam pela mesma rota, e o servidor sabe de qual das
// duas tabelas veio.
export function useSendFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message) => api.post('/feedbacks', { message }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-feedbacks'] }),
  });
}

/** O que a própria conta já mandou, com o destino que o admin deu a cada um. */
export function useMyFeedbacks() {
  return useQuery({
    queryKey: ['my-feedbacks'],
    queryFn: () => api.get('/feedbacks/me').then((r) => r.data),
  });
}

// Uma aba por status. A resposta traz `pending` junto, que é o aviso do menu —
// ele precisa aparecer mesmo quando a aba aberta é outra.
export function useFeedbacks(status = 'PENDENTE') {
  return useQuery({
    queryKey: ['feedbacks', status],
    queryFn: () => api.get('/feedbacks', { params: { status } }).then((r) => r.data),
  });
}

// Receber (vira tarefa) e mover para mensagens são a mesma operação: o feedback
// muda de aba. Por isso todas as listas saem do cache juntas.
export function useReviewFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => api.patch(`/feedbacks/${id}`, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedbacks'] }),
  });
}

/** Descartar apaga de vez — não sobra em aba nenhuma. */
export function useDiscardFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/feedbacks/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedbacks'] }),
  });
}

// ── Buildings ─────────────────────────────────────────────────────────────────
export function useLeaveBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (buildingId) => api.delete(`/buildings/${buildingId}/members/me`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-buildings'] });
      return refreshProfile();
    },
  });
}

// Os vínculos do usuário: cada item traz `building_id`, o nome do prédio e o
// papel dele ali dentro. É de propósito que a chave não é `id` — o que se lista
// aqui é o vínculo, e o papel muda de prédio para prédio.
export function useMyBuildings() {
  return useQuery({
    queryKey: ['my-buildings'],
    queryFn: () => api.get('/buildings/me').then((r) => r.data),
  });
}

export function useBuildings() {
  return useQuery({
    queryKey: ['buildings'],
    queryFn: () => api.get('/buildings').then((r) => r.data),
  });
}

// Prédios que o usuário administra — a tela inicial do gestor
export function useManagedBuildings() {
  return useQuery({
    queryKey: ['managed-buildings'],
    queryFn: () => api.get('/buildings/managed').then((r) => r.data),
  });
}

// Números do sistema inteiro — painel do admin
export function useSystemStats() {
  return useQuery({
    queryKey: ['system-stats'],
    queryFn: () => api.get('/buildings/stats').then((r) => r.data),
  });
}

export function useBuildingDashboard(id) {
  return useQuery({
    queryKey: ['building-dashboard', id],
    queryFn: () => api.get(`/buildings/${id}/dashboard`).then((r) => r.data),
    enabled: !!id,
  });
}

/** O histórico de vistorias de um prédio, oito por página. */
export function useBuildingHistory(id, params = {}, options = {}) {
  const { pageSize, enabled = true } = options;
  return usePagedList({
    queryKey: ['building-history', id, params],
    url: `/buildings/${id}/history`,
    params,
    pick: (d) => d.inspections ?? [],
    enabled: enabled && !!id,
    pageSize,
  });
}

// As três listagens de prédio (admin, gestor e vínculo) saem juntas do cache:
// criar ou apagar um prédio mexe em todas elas.
function invalidateBuildingLists(qc) {
  qc.invalidateQueries({ queryKey: ['buildings'] });
  qc.invalidateQueries({ queryKey: ['managed-buildings'] });
  qc.invalidateQueries({ queryKey: ['system-stats'] });
}

// Quem cria o prédio vira o gestor dele: o perfil precisa saber disso na hora.
export function useCreateBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/buildings', data).then((r) => r.data),
    onSuccess: () => {
      invalidateBuildingLists(qc);
      return refreshProfile();
    },
  });
}

export function useUpdateBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/buildings/${id}`, data).then((r) => r.data),
    onSuccess: () => invalidateBuildingLists(qc),
  });
}

export function useDeleteBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/buildings/${id}`).then((r) => r.data),
    onSuccess: () => {
      invalidateBuildingLists(qc);
      return refreshProfile();
    },
  });
}

export function useCreateFloor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buildingId, ...data }) => api.post(`/buildings/${buildingId}/floors`, data).then((r) => r.data),
    onSuccess: (_, { buildingId }) => qc.invalidateQueries({ queryKey: ['floors', buildingId] }),
  });
}

export function useDeleteFloor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buildingId, floorId }) => api.delete(`/buildings/${buildingId}/floors/${floorId}`).then((r) => r.data),
    onSuccess: (_, { buildingId }) => qc.invalidateQueries({ queryKey: ['floors', buildingId] }),
  });
}

// Devolve `{ managers, members }`: as duas naturezas de quem está no prédio —
// contas de gestor e usuários com papel — porque a tela é uma só.
export function useBuildingMembers(id) {
  return useQuery({
    queryKey: ['building-members', id],
    queryFn: () => api.get(`/buildings/${id}/members`).then((r) => r.data),
    enabled: !!id,
  });
}

/** Adiciona outro gestor ao prédio pelo e-mail da conta de gestor dele. */
export function useAddBuildingManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buildingId, email }) =>
      api.post(`/buildings/${buildingId}/managers`, { email }).then((r) => r.data),
    onSuccess: (_, { buildingId }) =>
      qc.invalidateQueries({ queryKey: ['building-members', buildingId] }),
  });
}

/** Tira um gestor do prédio. O último não sai — a API recusa com 409. */
export function useRemoveBuildingManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buildingId, managerId }) =>
      api.delete(`/buildings/${buildingId}/managers/${managerId}`).then((r) => r.data),
    onSuccess: (_, { buildingId }) => {
      qc.invalidateQueries({ queryKey: ['building-members', buildingId] });
      return refreshProfile();
    },
  });
}

/** Lista de gestores — painel do admin. */
export function useManagers(page = 1) {
  return useQuery({
    queryKey: ['managers', page],
    queryFn: () => api.get('/managers', { params: { page, limit: 20 } }).then((r) => r.data),
  });
}

// Papel de quem está vinculado ao prédio — só um gestor dele mexe.
// O perfil é recarregado porque o alvo pode ser o próprio usuário logado: com
// dois gestores, um deles pode passar a gestão e se rebaixar.
export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buildingId, userId, role }) =>
      api.patch(`/buildings/${buildingId}/members/${userId}`, { role }).then((r) => r.data),
    onSuccess: (_, { buildingId }) => {
      qc.invalidateQueries({ queryKey: ['building-members', buildingId] });
      qc.invalidateQueries({ queryKey: ['building-dashboard', buildingId] });
      qc.invalidateQueries({ queryKey: ['my-buildings'] });
      return refreshProfile();
    },
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buildingId, userId }) => api.delete(`/buildings/${buildingId}/members/${userId}`).then((r) => r.data),
    onSuccess: (_, { buildingId }) => qc.invalidateQueries({ queryKey: ['building-members', buildingId] }),
  });
}

/**
 * Busca o prédio pela chave de compartilhamento (não expõe o id do prédio).
 *
 * POST, e não GET: a chave é a credencial de entrada no prédio, e na
 * querystring ela ficaria guardada no log de acesso do servidor, no proxy e no
 * histórico do navegador. Continua sendo uma consulta — o cache do React Query
 * responde por isso.
 */
export function useBuildingByKey(shareKey) {
  return useQuery({
    queryKey: ['building-by-key', shareKey],
    queryFn: () => api.post('/buildings/lookup', { key: shareKey }).then((r) => r.data),
    enabled: !!shareKey,
    retry: false,
  });
}

export function useRequestAccess() {
  return useMutation({
    mutationFn: (shareKey) => api.post('/buildings/access-requests', { key: shareKey }).then((r) => r.data),
  });
}

export function useAccessRequests(buildingId) {
  return useQuery({
    queryKey: ['access-requests', buildingId],
    queryFn: () => api.get(`/buildings/${buildingId}/access-requests`, { params: { status: 'PENDING' } }).then((r) => r.data),
    enabled: !!buildingId,
  });
}

export function useReviewAccessRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buildingId, requestId, status }) =>
      api.patch(`/buildings/${buildingId}/access-requests/${requestId}`, { status }).then((r) => r.data),
    onSuccess: (_, { buildingId }) => {
      qc.invalidateQueries({ queryKey: ['access-requests', buildingId] });
      qc.invalidateQueries({ queryKey: ['building-members', buildingId] });
    },
  });
}

export function useFloors(buildingId) {
  return useQuery({
    queryKey: ['floors', buildingId],
    queryFn: () => api.get(`/buildings/${buildingId}/floors`).then((r) => r.data),
    enabled: !!buildingId,
  });
}

// ── Inspections ───────────────────────────────────────────────────────────────
/**
 * As vistorias visíveis à conta, oito por página.
 *
 * `enabled` existe porque a tela de histórico chama as duas listagens — esta e
 * a do prédio — e usa só uma: sem ele, quem não é ADMIN pagava uma requisição
 * por carregamento para um resultado que nenhuma parte da tela lê.
 */
export function useInspections(filters = {}, enabled = true, pageSize) {
  return usePagedList({
    queryKey: ['inspections', filters],
    url: '/inspections',
    params: filters,
    pick: (d) => d.inspections ?? [],
    enabled,
    pageSize,
  });
}

/**
 * O relatório completo do dia daquela vistoria.
 *
 * A listagem do histórico continua vistoria por vistoria; o que muda é o
 * clique. Se três pessoas vistoriaram o prédio no mesmo dia, abrir qualquer uma
 * delas abre o mesmo documento, com as três juntas.
 */
export function useDayReport(reportId) {
  return useQuery({
    queryKey: ['day-report', reportId],
    queryFn: () => api.get(`/inspections/${reportId}/day`).then((r) => r.data),
    enabled: !!reportId,
  });
}

// Envio único: a vistoria inteira (todos os andares) vai de uma vez só
/**
 * Envia a vistoria inteira.
 *
 * Recebe `{ idempotencyKey, payload }` e não só o corpo: a chave viaja no
 * cabeçalho `Idempotency-Key`, e é o que faz o toque duplo — ou o retry
 * automático numa rede ruim — devolver o relatório que já foi criado em vez de
 * criar um segundo. Em campo, no celular, isso não é hipótese.
 */
export function useSubmitInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, payload }) =>
      api
        .post('/inspections', payload, {
          headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspections'] });
      qc.invalidateQueries({ queryKey: ['building-history'] });
      qc.invalidateQueries({ queryKey: ['building-dashboard'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['day-report'] });
      // Cada ocorrência enviada é um chamado novo na fila do moderador.
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-stats'] });
    },
  });
}

// Descarta a vistoria (só um gestor do prédio) — apaga relatório, ocorrências e planilha
export function useDeleteInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/inspections/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspections'] });
      qc.invalidateQueries({ queryKey: ['building-history'] });
      qc.invalidateQueries({ queryKey: ['building-dashboard'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['day-report'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-stats'] });
    },
  });
}

// Gera a planilha de novo quando o upload falhou no envio
export function useGenerateExcel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.post(`/inspections/${id}/excel`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspections'] });
      qc.invalidateQueries({ queryKey: ['building-history'] });
      // A planilha é do dia: refazê-la muda a URL de todas as vistorias daquela
      // data, não só a desta linha.
      qc.invalidateQueries({ queryKey: ['day-report'] });
    },
  });
}

// ── Chamados ──────────────────────────────────────────────────────────────────
// A ocorrência vira chamado depois da vistoria: o moderador do prédio recebe,
// encaminha a um responsável, que confirma o recebimento e atende, e fecha. As
// telas da barra lateral são a mesma consulta com `group` diferente — e o
// histórico de ocorrências é essa mesma consulta com o grupo TODOS.

/** Os responsáveis alocados naquele prédio — o droplist do formulário. */
export function useBuildingResponsibles(buildingId) {
  return useQuery({
    queryKey: ['building-responsibles', buildingId],
    queryFn: () => api.get(`/buildings/${buildingId}/responsibles`).then((r) => r.data),
    enabled: !!buildingId,
  });
}

export function useTickets(buildingId, group = 'NOVOS') {
  return useQuery({
    queryKey: ['tickets', buildingId, group],
    queryFn: () =>
      api.get(`/buildings/${buildingId}/tickets`, { params: { group, limit: 100 } }).then((r) => r.data),
    enabled: !!buildingId,
  });
}

/**
 * O histórico de ocorrências do prédio: a linha do tempo inteira, de todos os
 * estados, do mais recente para o mais antigo.
 *
 * É a consulta da fila do moderador com o grupo TODOS — daí delegar a
 * `useTickets` em vez de repetir a rota. A leitura é livre de quem tem vínculo
 * com o prédio, e é isso que o inspetor e o visualizador veem no histórico.
 * Ler não move nada: nenhuma ação sai daqui.
 */
export function useBuildingOccurrences(buildingId, group = 'TODOS', filters = {}, pageSize) {
  return usePagedList({
    // Os filtros entram na chave: cada recorte é uma lista própria, e é o que
    // devolve a paginação à primeira página quando eles mudam.
    queryKey: ['tickets', buildingId, group, filters],
    url: `/buildings/${buildingId}/tickets`,
    params: { group, ...filters },
    pick: (d) => d.tickets ?? [],
    enabled: !!buildingId,
    pageSize,
  });
}

/** Contadores do painel do moderador: aberto, encaminhado, em andamento, concluído. */
export function useTicketStats(buildingId) {
  return useQuery({
    queryKey: ['ticket-stats', buildingId],
    queryFn: () => api.get(`/buildings/${buildingId}/tickets/stats`).then((r) => r.data),
    enabled: !!buildingId,
  });
}

/**
 * O que foi encaminhado a quem está logado — a tela do responsável, e o sino da
 * tela inicial.
 *
 * `enabled` existe por causa do sino: ele mora numa tela que todo mundo abre, e
 * quem não atende chamado não tem o que buscar aqui.
 *
 * `includeClosed` traz também o que o moderador já finalizou. O sino não quer
 * isso — ele avisa do que precisa de ação —, mas a tela do responsável mostra o
 * que ele concluiu ao lado do que foi aprovado, e sem esses o histórico dele
 * terminaria em "aguardando o moderador" para sempre. Vai na chave da consulta
 * porque são duas listas diferentes, e compartilhá-la faria uma sobrescrever a
 * outra no cache.
 */
export function useMyTickets(enabled = true, includeClosed = false) {
  return useQuery({
    queryKey: ['my-tickets', includeClosed],
    queryFn: () =>
      api
        .get('/tickets/me', { params: includeClosed ? { closed: 'true' } : undefined })
        .then((r) => r.data),
    enabled,
  });
}

/**
 * Toda ação sobre um chamado mexe em duas listas — a de onde ele saiu e a para
 * onde foi — e nos contadores. Por isso nenhuma delas invalida só a própria:
 * encaminhar em "Novos" tem de esvaziar a linha ali e fazê-la aparecer em
 * "Em andamento".
 */
function invalidateTickets(qc) {
  qc.invalidateQueries({ queryKey: ['tickets'] });
  qc.invalidateQueries({ queryKey: ['ticket-stats'] });
  qc.invalidateQueries({ queryKey: ['my-tickets'] });
}

/** Encaminhar: o chamado ganha dono e passa a esperar o aceite dele. */
export function useForwardTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, responsible_id }) =>
      api.post(`/tickets/${id}/forward`, { responsible_id }).then((r) => r.data),
    onSuccess: () => invalidateTickets(qc),
  });
}

/** O que o moderador acrescenta ao chamado: manutenção necessária e valor. */
export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/tickets/${id}`, data).then((r) => r.data),
    onSuccess: () => invalidateTickets(qc),
  });
}

/** O responsável confirma que recebeu — é aqui que o chamado passa a correr. */
export function useReceiveTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.post(`/tickets/${id}/receive`).then((r) => r.data),
    onSuccess: () => invalidateTickets(qc),
  });
}

/**
 * O responsável informa que terminou, com o relatório do serviço.
 *
 * Não fecha o chamado — só o moderador fecha. O relatório é opcional: sem texto,
 * o campo nem viaja, e o que já estava gravado fica.
 */
export function useReportTicketDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done_report }) =>
      api
        .post(`/tickets/${id}/done`, done_report === undefined ? {} : { done_report })
        .then((r) => r.data),
    onSuccess: () => invalidateTickets(qc),
  });
}

/** Cancela o envio: o chamado volta a ser novo, sem dono. */
export function useUnforwardTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.post(`/tickets/${id}/unforward`).then((r) => r.data),
    onSuccess: () => invalidateTickets(qc),
  });
}

/**
 * Fechar. É o único caminho para concluído, e só o moderador passa por ele.
 *
 * O relatório do moderador e o gasto viajam junto: finalizar passou a ser um
 * formulário, e não um botão só. Os dois são opcionais — fechar sem escrever
 * nada continua valendo.
 */
export function useCloseTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.post(`/tickets/${id}/close`, data).then((r) => r.data),
    onSuccess: () => invalidateTickets(qc),
  });
}

/**
 * O relatório do período, em .docx.
 *
 * Não é `useQuery`: o resultado não é estado da tela, é um arquivo que a pessoa
 * pede uma vez. Guardá-lo em cache só encheria a memória com um blob que
 * ninguém vai reler.
 *
 * O nome vem do `Content-Disposition` — é o servidor que sabe o nome do prédio
 * e o período. Se o cabeçalho não chegar, um nome de reserva evita que o
 * download saia sem extensão.
 */
export function useTicketReport() {
  return useMutation({
    mutationFn: async ({ buildingId, from, to }) => {
      const res = await api.get(`/buildings/${buildingId}/tickets/report`, {
        params: { from, to },
        responseType: 'blob',
      });

      const match = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '');
      const name = match?.[1] ?? `manutencoes-${from}-${to}.docx`;

      // O clique é programático porque o arquivo só existe depois da resposta:
      // um `<a href>` comum teria de repetir a rota sem o cabeçalho de sessão.
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Sem revogar, cada relatório gerado deixa o blob inteiro na memória da
      // aba até ela ser fechada.
      URL.revokeObjectURL(url);

      return name;
    },
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────────
// `params` nulo = ainda não há o que consultar (ex.: usuário sem prédio):
// sem o `enabled` a tela disparava a busca do mesmo jeito.
export function useCalendar(params) {
  return useQuery({
    queryKey: ['calendar', params],
    queryFn: () => api.get('/calendar', { params }).then((r) => r.data),
    enabled: !!params,
  });
}
