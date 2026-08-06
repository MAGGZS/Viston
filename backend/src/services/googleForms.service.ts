import fetch from 'node-fetch';
import { FormItemResponse, AuditAction } from '@prisma/client';
import { config } from '../config';
import { inspectionRepository } from '../repositories/inspection.repository';
import { auditRepository } from '../repositories/building.repository';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFormPayload(item: FormItemResponse, observation?: string): URLSearchParams {
  const { fields } = config.googleForms;
  const params = new URLSearchParams();

  params.append(fields.itemName, item.item_name);
  params.append(fields.quantity, item.quantity !== null ? String(item.quantity) : '');
  params.append(fields.isMarked, item.is_marked !== null ? (item.is_marked ? 'Sim' : 'Não') : '');
  params.append(fields.status, item.status ?? 'N/A');
  params.append(fields.observation, observation ?? '');

  return params;
}

async function submitToGoogleForms(params: URLSearchParams): Promise<void> {
  const url = config.googleForms.url;
  if (!url) throw new Error('GOOGLE_FORM_URL não configurado');

  const res = await fetch(url, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    redirect: 'manual', // Google Forms redireciona após submit — isso é esperado
  });

  // Google Forms retorna 302 em sucesso — qualquer 4xx/5xx é falha real
  if (res.status >= 400) {
    throw new Error(`Google Forms retornou status ${res.status}`);
  }
}

export async function syncGoogleForms(reportId: string, userId?: string): Promise<void> {
  const report = await inspectionRepository.findById(reportId);
  if (!report) throw new Error(`Relatório ${reportId} não encontrado`);

  const allItems: Array<FormItemResponse & { observations?: string[] }> = [];

  for (const entry of report.floor_form_entries) {
    // Primeira observação do andar vai junto com o primeiro item do andar;
    // as demais são enviadas como entradas separadas (item_name vazio)
    const obs = entry.observations ?? [];
    entry.form_item_responses.forEach((item, idx) => {
      allItems.push({ ...item, observations: idx === 0 ? obs : [] });
    });
  }

  const errors: string[] = [];

  for (const item of allItems) {
    try {
      const obs = (item as FormItemResponse & { observations?: string[] }).observations;
      const obsText = obs && obs.length > 0 ? obs.join(' | ') : undefined;
      const params = buildFormPayload(item, obsText);
      await submitToGoogleForms(params);
      // Delay entre envios para evitar rate limiting do Google
      await sleep(300 + Math.random() * 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Item ${item.item_name} (${item.id}): ${msg}`);
    }
  }

  if (errors.length === 0) {
    await inspectionRepository.update(reportId, {
      google_form_synced: true,
      google_form_synced_at: new Date(),
    });
    await auditRepository.log({
      user_id: userId,
      action: AuditAction.SYNC_GOOGLE_FORM,
      entity: 'InspectionReport',
      entity_id: reportId,
    });
  } else {
    await auditRepository.log({
      user_id: userId,
      action: AuditAction.SYNC_GOOGLE_FORM_FAILED,
      entity: 'InspectionReport',
      entity_id: reportId,
      metadata: { errors },
    });
    throw new Error(`Sincronização parcialmente falhou: ${errors.join('; ')}`);
  }
}
