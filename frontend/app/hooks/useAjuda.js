'use client';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api from '@/app/lib/api';

/**
 * As consultas da central de ajuda.
 *
 * Arquivo próprio, e não mais um bloco no `useApi.js`, que já passa de mil e
 * seiscentas linhas: a central é uma área inteira, com público e admin, e é
 * mais fácil de achar (e de apagar, se um dia sair) quando mora junto. O
 * desenho é o mesmo de lá: uma função por rota, chave de cache explícita, e a
 * mutação diz o que invalida.
 *
 * O contrato de cada rota está em tutoriais/API.md.
 */

// ── Usuário ───────────────────────────────────────────────────────────────────

/** As pastas que a conta enxerga, com `mine` e a contagem de publicados. */
export function useHelpFolders() {
  return useQuery({
    queryKey: ['help', 'folders'],
    queryFn: () => api.get('/help/folders').then((r) => r.data),
  });
}

/** Uma pasta e os tutoriais publicados dela. */
export function useHelpFolder(slug) {
  return useQuery({
    queryKey: ['help', 'folder', slug],
    queryFn: () => api.get(`/help/folders/${encodeURIComponent(slug)}`).then((r) => r.data),
    enabled: !!slug,
    // 404 é resposta, e não falha passageira: a pasta não existe para esta
    // conta, e perguntar de novo três vezes só atrasa a tela que diz isso.
    retry: (n, err) => err?.response?.status !== 404 && n < 2,
  });
}

/**
 * Um tutorial, com as abas e as URLs assinadas do vídeo.
 *
 * `staleTime` de dez minutos: as URLs valem quatro horas e o backend devolve a
 * mesma enquanto ela tiver uma hora de vida, então reler a cada foco de janela
 * só gastaria uma consulta para receber o que já se tem. Quando a URL vence com
 * a tela aberta, quem pede outra é o player (ver `onUrlsVencidas`).
 */
export function useHelpFeature(slug) {
  return useQuery({
    queryKey: ['help', 'feature', slug],
    queryFn: () => api.get(`/help/features/${encodeURIComponent(slug)}`).then((r) => r.data),
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
    retry: (n, err) => err?.response?.status !== 404 && n < 2,
  });
}

/**
 * A busca. Só sai com duas letras ou mais, que é o mínimo do servidor: abaixo
 * disso ele responderia 400 a cada tecla.
 *
 * `keepPreviousData` segura a lista anterior enquanto a nova chega, para os
 * resultados não piscarem vazios entre uma tecla e outra.
 */
export function useHelpSearch(termo) {
  const q = (termo ?? '').trim();
  return useQuery({
    queryKey: ['help', 'search', q],
    queryFn: () => api.get('/help/search', { params: { q } }).then((r) => r.data),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  });
}

/**
 * O "Isso ajudou?".
 *
 * Em vez de invalidar o tutorial e buscar tudo de novo, a resposta entra direto
 * no cache: o que mudou é só `my_feedback`, e reler a funcionalidade inteira
 * trocaria o `src` do vídeo no meio da reprodução se a URL tivesse sido
 * renovada nesse intervalo.
 */
export function useHelpFeedback(slug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ helpful, comment }) =>
      api
        .post(`/help/features/${encodeURIComponent(slug)}/feedback`, comment ? { helpful, comment } : { helpful })
        .then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['help', 'feature', slug], (antes) =>
        antes?.feature
          ? { ...antes, feature: { ...antes.feature, my_feedback: { helpful: data.feedback.helpful, created_at: data.feedback.created_at } } }
          : antes
      );
    },
  });
}

// ── Admin ─────────────────────────────────────────────────────────────────────

const TREE_KEY = ['help-admin', 'tree'];

/** A árvore inteira, com o estado de cada funcionalidade e as contagens. */
export function useHelpTree() {
  return useQuery({
    queryKey: TREE_KEY,
    queryFn: () => api.get('/admin/help/tree').then((r) => r.data),
  });
}

/**
 * O que o admin muda reflete na central do usuário também (título, ordem,
 * publicação). As duas famílias de chave saem juntas do cache.
 */
function invalidarAjuda(qc) {
  qc.invalidateQueries({ queryKey: ['help-admin'] });
  qc.invalidateQueries({ queryKey: ['help'] });
}

/** Leva o `catalogo.json` do deploy para o banco. */
export function useHelpSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ textos = false } = {}) =>
      api.post('/admin/help/sync', textos ? { textos: true } : {}).then((r) => r.data),
    onSuccess: () => invalidarAjuda(qc),
  });
}

export function useUpdateHelpFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/admin/help/folders/${id}`, body).then((r) => r.data),
    onSuccess: () => invalidarAjuda(qc),
  });
}

/**
 * As duas reordenações devolvem a árvore já na ordem nova: ela entra direto no
 * cache, e a lista não pisca entre o clique e a releitura.
 */
export function useReorderHelpFolders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids) => api.patch('/admin/help/folders/order', { ids }).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(TREE_KEY, data);
      qc.invalidateQueries({ queryKey: ['help'] });
    },
  });
}

export function useReorderHelpFeatures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, ids }) =>
      api.patch(`/admin/help/folders/${folderId}/features/order`, { ids }).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(TREE_KEY, data);
      qc.invalidateQueries({ queryKey: ['help'] });
    },
  });
}

/** A funcionalidade como o admin vê, publicada ou não. */
export function useAdminHelpFeature(id) {
  return useQuery({
    queryKey: ['help-admin', 'feature', id],
    queryFn: () => api.get(`/admin/help/features/${id}`).then((r) => r.data),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
    retry: (n, err) => err?.response?.status !== 404 && n < 2,
  });
}

/**
 * Toda escrita sobre uma funcionalidade devolve `{ feature: AdminFeature }`
 * atualizada. Ela entra no cache da tela aberta, e o resto (árvore e central do
 * usuário) é invalidado, porque título, estado e publicação aparecem lá.
 */
function aoGravarFeature(qc, id) {
  return (data) => {
    qc.setQueryData(['help-admin', 'feature', id], data);
    qc.invalidateQueries({ queryKey: TREE_KEY });
    qc.invalidateQueries({ queryKey: ['help'] });
  };
}

export function useUpdateHelpFeature(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.patch(`/admin/help/features/${id}`, body).then((r) => r.data),
    onSuccess: aoGravarFeature(qc, id),
  });
}

/** Feature por id, quando quem edita está na árvore e não na tela dela. */
export function useUpdateHelpFeatureById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/admin/help/features/${id}`, body).then((r) => r.data),
    onSuccess: (data) => aoGravarFeature(qc, data?.feature?.id)(data),
  });
}

/** Ajuste fino de uma aba. A resposta é a funcionalidade inteira da aba. */
export function useUpdateHelpStep(featureId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/admin/help/steps/${id}`, body).then((r) => r.data),
    onSuccess: aoGravarFeature(qc, featureId),
  });
}

export function usePublishHelpFeature(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (publicar) =>
      api.post(`/admin/help/features/${id}/${publicar ? 'publish' : 'unpublish'}`).then((r) => r.data),
    onSuccess: aoGravarFeature(qc, id),
  });
}

/**
 * Publica ou despublica vários de uma vez, pela seleção da árvore. A resposta
 * é só `{ updated }`; árvore, telas abertas de funcionalidade e a central do
 * usuário saem todas do cache.
 */
export function usePublishHelpFeaturesBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, published }) =>
      api.post('/admin/help/features/publish-batch', { ids, published }).then((r) => r.data),
    onSuccess: () => invalidarAjuda(qc),
  });
}

/** Pede as URLs de upload: um diretório temporário novo a cada chamada. */
export function pedirUrlsDeEnvio(id) {
  return api.post(`/admin/help/features/${id}/video/upload-urls`).then((r) => r.data);
}

export function useCommitHelpVideo(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uploadId) =>
      api.post(`/admin/help/features/${id}/video/commit`, { upload_id: uploadId }).then((r) => r.data),
    onSuccess: aoGravarFeature(qc, id),
  });
}
