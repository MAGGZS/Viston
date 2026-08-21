'use client';
import { useCallback, useState } from 'react';
import api from '@/app/lib/api';
import { useToastStore } from '@/app/store/toast';

/**
 * Baixar a planilha de uma vistoria.
 *
 * O link não vem mais junto da lista: o bucket é privado e a URL é assinada na
 * hora, por quem já provou ter vínculo com o prédio, e vale poucos minutos.
 * Antes, cada linha do histórico carregava uma URL pública e permanente — quem
 * saísse do prédio continuava baixando o relatório, e o link colado num grupo
 * de mensagens virava acesso vitalício.
 *
 * A navegação é `location.href` e não `window.open`: a URL assinada vem com
 * `Content-Disposition: attachment`, então o navegador baixa e a página fica
 * onde está — e, ao contrário de uma aba nova aberta depois de um `await`, isso
 * não é barrado por bloqueador de pop-up.
 */
export function useExcelDownload() {
  const [pendingId, setPendingId] = useState(null);
  const { show: toast } = useToastStore();

  const download = useCallback(
    async (reportId) => {
      if (!reportId) return;
      setPendingId(reportId);
      try {
        const { data } = await api.get(`/inspections/${reportId}/excel`);
        if (data?.excel_url) window.location.href = data.excel_url;
      } catch (e) {
        toast(e?.response?.data?.error?.message || 'Erro ao baixar a planilha', 'error');
      } finally {
        setPendingId(null);
      }
    },
    [toast]
  );

  return { download, pendingId, isPending: pendingId !== null };
}
