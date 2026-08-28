'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Check, Search } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { FloorForm } from '@/app/components/FloorForm';
import { Button, Card, Modal, Spinner } from '@/app/components/ui';
import { UnsavedChangesModal } from '@/app/components/ConfirmModal';
import { UnsavedScope, useUnsavedGuard, useUnsavedScope } from '@/app/hooks/useUnsavedGuard';
import { M, MRound, MCard, MButton, MButtonSoft, MButtonGhost, MSectionHead, MPill } from '@/app/components/mobile/kit';
import { useFloors, useBuildingByKey, useSubmitInspection, useRequestAccess, useBuildingResponsibles } from '@/app/hooks/useApi';
import { useExcelDownload } from '@/app/hooks/useExcelDownload';
import { useActiveBuilding } from '@/app/hooks/useActiveBuilding';
import { BuildingSwitcher } from '@/app/components/BuildingSwitcher';
import { formatShareKey, normalizeShareKey, isCompleteShareKey } from '@/app/lib/shareKey';
import { sortFloorsDesc } from '@/app/lib/floorOrder';
import { clearDraft, loadDraft, saveDraft } from '@/app/lib/draft';
import { newSubmissionKey } from '@/app/lib/idempotency';
import { useAuthStore } from '@/app/store/auth';
import { canInspect } from '@/app/lib/roles';
import { useToastStore } from '@/app/store/toast';

/**
 * O que vai para a API.
 *
 * Responsável em branco vira ausência, e não string vazia: o chamado sem dono é
 * um estado normal — ele chega assim à fila do moderador —, mas a API espera um
 * id de conta ou nada.
 */
function toPayload(records = []) {
  return records.map(({ responsible_id, ...record }) => ({
    ...record,
    ...(responsible_id ? { responsible_id } : {}),
  }));
}

// Tela quando não tem vínculo: busca pela chave do prédio e solicita acesso
function StepSemVinculo() {
  const [inputKey, setInputKey] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const [requested, setRequested] = useState(false);
  const { data, isLoading, error } = useBuildingByKey(searchKey);
  const requestAccess = useRequestAccess();
  const { show: toast } = useToastStore();

  function handleSearch() {
    const key = normalizeShareKey(inputKey);
    if (!isCompleteShareKey(key)) {
      toast('Chave inválida. Ela tem 12 caracteres.', 'error');
      return;
    }
    setSearchKey(key);
    setRequested(false);
  }

  async function handleRequest() {
    try {
      await requestAccess.mutateAsync(searchKey);
      setRequested(true);
      toast('Solicitação enviada! Aguarde a aprovação.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao solicitar acesso', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 20, padding: 16 }}>
        <p style={{ color: M.text, fontSize: 14, lineHeight: 1.6 }}>
          Você não tem vínculo com nenhum prédio. Digite a chave fornecida pelo administrador e solicite acesso.
        </p>
      </div>

      <Card>
        <p style={{ color: M.mute, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Chave do Prédio</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ flex: 1, background: M.chip, borderRadius: 16, padding: '11px 14px', color: M.text, fontSize: 14, outline: 'none', fontWeight: 600, letterSpacing: '0.18em' }}
            placeholder="ABCD-EFGH-JKMN"
            maxLength={14}
            value={inputKey}
            onChange={e => setInputKey(formatShareKey(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="secondary" onClick={handleSearch}>
            <Search size={15} />
          </Button>
        </div>
      </Card>

      {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>}
      {error && <p style={{ color: M.danger, fontSize: 14, textAlign: 'center' }}>Chave inválida ou prédio não encontrado</p>}

      {data && !requested && (
        <div className="anim-fade-up" style={{ background: M.chip, borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, background: 'rgba(245,197,24,0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={18} color={M.accentInk} />
            </div>
            <div>
              <p style={{ color: M.text, fontWeight: 600, fontSize: 15 }}>{data.name}</p>
              {data.description && <p style={{ color: M.faint, fontSize: 12 }}>{data.description}</p>}
            </div>
          </div>
          <Button onClick={handleRequest} loading={requestAccess.isPending} className="w-full">
            Conectar-se
          </Button>
        </div>
      )}

      {requested && (
        <div className="anim-scale-in" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, padding: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>✓</p>
          <p style={{ color: M.text, fontWeight: 600, fontSize: 15 }}>Solicitação enviada!</p>
          <p style={{ color: M.mute, fontSize: 14, marginTop: 4 }}>Aguarde o administrador aprovar seu acesso.</p>
        </div>
      )}
    </div>
  );
}

// Tela com vínculo: seleciona andares do prédio vinculado (já listados do maior para o menor)
function StepSelectFloors({ building, floors, onStart }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const allSelected = floors.length > 0 && selectedIds.length === floors.length;

  function toggle(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : floors.map(f => f.id));
  }

  function handleStart() {
    if (!selectedIds.length) return;
    // A vistoria avança do andar mais alto para o mais baixo
    onStart(floors.filter(f => selectedIds.includes(f.id)));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <MCard style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, background: M.accentSoft, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Building2 size={19} color={M.accentInk} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 15, color: M.text }}>{building.name}</p>
          <p style={{ color: M.mute, fontSize: 12, marginTop: 2 }}>Do andar mais alto até o mais baixo</p>
        </div>
      </MCard>

      <MSectionHead
        title="Andares"
        action={<MPill onClick={toggleAll}>{allSelected ? 'Limpar' : 'Todos'}</MPill>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {floors.map((floor, idx) => {
          const sel = selectedIds.includes(floor.id);
          return (
            <button key={floor.id} onClick={() => toggle(floor.id)}
              className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
              style={{
                padding: '18px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', textAlign: 'left',
                background: sel ? M.accent : M.card,
                color: sel ? '#000' : M.text,
                fontFamily: M.display, fontWeight: 600, fontSize: 14,
                transition: 'background 0.15s',
              }}>
              {floor.label}
            </button>
          );
        })}
      </div>

      <MButton onClick={handleStart} disabled={!selectedIds.length} style={{ width: '100%', marginTop: 6 }}>
        Começar {selectedIds.length ? `(${selectedIds.length})` : ''}
      </MButton>
    </div>
  );
}

export default function InspecaoPage() {
  const { download, pendingId } = useExcelDownload();
  const router = useRouter();
  const { user } = useAuthStore();
  const [step, setStep] = useState('select');
  const [floors, setFloors] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // O que já foi preenchido. Continua em memória durante a vistoria — e é
  // copiado para o aparelho a cada andar concluído (ver `saveDraft`).
  const [drafts, setDrafts] = useState({});
  const [finishedReport, setFinishedReport] = useState(null);
  // Rascunho achado no aparelho, esperando a pessoa dizer se retoma.
  const [resumable, setResumable] = useState(null);
  // Prédio cujo rascunho já foi consultado — a pergunta é feita uma vez só.
  const [checkedBuilding, setCheckedBuilding] = useState(null);
  /**
   * Chave desta tentativa de envio.
   *
   * Nasce quando a vistoria começa e só morre quando o servidor confirma: o
   * reenvio depois de uma rede que caiu carrega a mesma chave, e o servidor
   * devolve o relatório que já criou em vez de criar um segundo.
   */
  const submissionKey = useRef(null);

  /**
   * O que o andar aberto tem de preenchido e ainda não enviado.
   *
   * O formulário de andar avisa daqui de dentro (ver `FloorForm`), e é o que
   * faz o botão de voltar — e a barra de baixo, e o F5 — perguntarem antes de
   * levar embora a ocorrência que estava sendo descrita.
   */
  const { dirty, report } = useUnsavedScope();
  const saida = useUnsavedGuard(dirty);

  // Só os prédios em que esta pessoa vistoria — e não a lista inteira: com papel
  // por prédio, dá para ser inspetor num e só acompanhar outro, e abrir a
  // vistoria no prédio errado só daria 403 no fim. Com mais de um, quem escolhe
  // é ela, e a escolha vale para a próxima vez.
  const {
    buildings: inspectableBuildings,
    active: myBuilding,
    buildingId,
    setActive: setActiveBuilding,
    isLoading: buildingsLoading,
  } = useActiveBuilding({ filter: (b) => canInspect(user, b.building_id) });
  const hasBuilding = !!myBuilding;

  const { data: floorsData, isLoading: floorsLoading } = useFloors(myBuilding?.building_id);
  // Só os responsáveis daquele prédio entram no droplist da ocorrência.
  const { data: responsibles = [] } = useBuildingResponsibles(myBuilding?.building_id);
  const orderedFloors = useMemo(() => sortFloorsDesc(floorsData?.floors ?? []), [floorsData]);

  const { mutateAsync: submitInspection, isPending: isSubmitting } = useSubmitInspection();
  const { show: toast } = useToastStore();

  const currentFloor = floors[currentIndex];
  const isLast = currentIndex === floors.length - 1;

  /**
   * Vistoria interrompida neste prédio?
   *
   * Estado derivado ajustado no próprio render, como no `useExitTransition`:
   * num efeito, a tela apareceria uma vez sem a pergunta e a caixa entraria por
   * cima logo depois. `checkedBuilding` garante uma pergunta só por prédio —
   * recusar não pode fazer ela voltar no render seguinte.
   *
   * `buildingId` só existe depois de a consulta dos prédios responder, bem
   * depois da hidratação: no primeiro render do cliente isto não roda, e o
   * `localStorage` não é lido no servidor.
   */
  if (buildingId && checkedBuilding !== buildingId && step === 'select' && floors.length === 0) {
    setCheckedBuilding(buildingId);
    setResumable(loadDraft(buildingId));
  }

  function handleStart(selectedFloors) {
    const ordered = sortFloorsDesc(selectedFloors);
    submissionKey.current = newSubmissionKey();
    setFloors(ordered);
    setCurrentIndex(0);
    setDrafts({});
    setStep('form');
    saveDraft(buildingId, {
      floors: ordered,
      drafts: {},
      current_index: 0,
      submission_key: submissionKey.current,
    });
  }

  /** Retoma de onde parou: os mesmos andares, o mesmo preenchimento. */
  function handleResume() {
    const draft = resumable;
    setResumable(null);
    if (!draft) return;

    submissionKey.current = draft.submission_key ?? newSubmissionKey();
    setFloors(draft.floors);
    setDrafts(draft.drafts ?? {});
    setCurrentIndex(Math.min(draft.current_index ?? 0, draft.floors.length - 1));
    setStep('form');
  }

  function handleDiscardDraft() {
    clearDraft(buildingId);
    setResumable(null);
  }

  function resetToSelect() {
    clearDraft(buildingId);
    submissionKey.current = null;
    setStep('select');
    setFloors([]);
    setCurrentIndex(0);
    setDrafts({});
    setFinishedReport(null);
  }

  /**
   * Voltar, com a pergunta quando há o que perder.
   *
   * Do primeiro andar, voltar é desistir da vistoria: o rascunho guardado no
   * aparelho sai junto, e é por isso que a pergunta ali é a outra — "descartar
   * a vistoria", não "descartar o andar".
   */
  function handleBack() {
    if (step !== 'form') return router.back();
    if (currentIndex > 0) return saida.guard(() => setCurrentIndex(i => i - 1));
    saida.guard(resetToSelect);
  }

  async function handleFloorSubmit(records) {
    // O rascunho guarda o que o formulário devolveu, inclusive o responsável em
    // branco: é ele que volta para a tela quando a pessoa anda para trás.
    const updated = { ...drafts, [currentFloor.id]: records };
    setDrafts(updated);

    if (!isLast) {
      const next = currentIndex + 1;
      // O andar concluído vai para o aparelho antes de a tela virar: é aqui que
      // a vistoria deixa de morar só na memória da aba.
      saveDraft(buildingId, {
        floors,
        drafts: updated,
        current_index: next,
        submission_key: submissionKey.current,
      });
      setCurrentIndex(next);
      return;
    }

    // Último andar: só agora tudo é enviado e vira relatório, Excel, calendário e histórico
    saveDraft(buildingId, {
      floors,
      drafts: updated,
      current_index: currentIndex,
      submission_key: submissionKey.current,
    });

    try {
      const report = await submitInspection({
        // A chave viaja no cabeçalho: reenviar depois de uma rede que caiu
        // devolve o relatório que já existe, em vez de criar um segundo.
        idempotencyKey: submissionKey.current,
        payload: {
          building_id: buildingId,
          floors: floors.map(f => ({ floor_id: f.id, records: toPayload(updated[f.id]) })),
        },
      });
      // O rascunho sai só depois de o servidor confirmar. Falhou, ele fica — é
      // exatamente quando ele serve.
      clearDraft(buildingId);
      submissionKey.current = null;
      setFinishedReport(report);
      setStep('done');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao enviar vistoria', 'error');
    }
  }

  return (
    <RouteGuard roles={['ADMIN', 'GESTOR', 'INSPECTOR']}>
      <div style={{ minHeight: '100vh', background: M.bg, paddingBottom: 40 }}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, background: M.bg, padding: '48px 16px 14px', zIndex: 10 }}>
          <div className="anim-fade-down" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <MRound label="Voltar" onClick={handleBack}>
              <ArrowLeft size={19} />
            </MRound>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontFamily: M.display, fontWeight: 600, fontSize: 19, color: M.text }}>
                {step === 'select' && 'Nova vistoria'}
                {step === 'form' && currentFloor?.label}
                {step === 'done' && 'Vistoria enviada'}
              </h1>
              {step === 'form' && (
                <p style={{ color: M.mute, fontSize: 12, marginTop: 2 }}>Andar {currentIndex + 1} de {floors.length}</p>
              )}
            </div>
          </div>
          {step === 'form' && (
            <div style={{ marginTop: 14, height: 4, background: M.chip, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: M.accent, borderRadius: 99, width: `${((currentIndex + 1) / floors.length) * 100}%`, transition: 'width 0.3s' }} />
            </div>
          )}
        </div>

        <div style={{ padding: '10px 16px' }}>
          {step === 'select' && (
            <div className="anim-fade-up">
            {buildingsLoading || floorsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
            ) : !hasBuilding ? (
              <StepSemVinculo />
            ) : (
              <>
                {/* Só aparece com mais de um prédio para vistoriar. */}
                <BuildingSwitcher
                  buildings={inspectableBuildings}
                  buildingId={buildingId}
                  onChange={setActiveBuilding}
                  style={{ width: '100%', marginBottom: 14 }}
                />
                <StepSelectFloors
                  building={myBuilding}
                  floors={orderedFloors}
                  onStart={handleStart}
                />
              </>
            )}
            </div>
          )}

          {step === 'form' && currentFloor && (
            <div className="anim-fade-up">
            <UnsavedScope report={report}>
            <FloorForm
              key={currentFloor.id}
              floor={currentFloor}
              inspectorName={user?.name}
              initialRecords={drafts[currentFloor.id]}
              responsibles={responsibles}
              onSubmit={handleFloorSubmit}
              isLoading={isSubmitting}
              isLast={isLast}
            />
            </UnsavedScope>
            </div>
          )}

          {step === 'done' && (
            <div className="anim-scale-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, paddingTop: 48, textAlign: 'center' }}>
              <div className="anim-pop-in" style={{ width: 76, height: 76, background: M.accent, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={34} color="#000" strokeWidth={3} />
              </div>
              <div>
                <h2 style={{ fontFamily: M.display, fontWeight: 600, fontSize: 22, color: M.text }}>Vistoria enviada</h2>
                {/* A planilha é montada logo depois da resposta (ver §2.2 no
                    serviço): o relatório já está no histórico, ela chega em
                    seguida — e o botão abaixo a busca de qualquer jeito. */}
                <p style={{ color: M.mute, fontSize: 14, marginTop: 6 }}>
                  O relatório já está no histórico. A planilha fica pronta em instantes.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                {finishedReport?.id && (
                  <MButtonSoft
                    onClick={() => download(finishedReport.id)}
                    loading={pendingId === finishedReport.id}
                    style={{ width: '100%' }}
                  >
                    Baixar planilha
                  </MButtonSoft>
                )}
                <MButton onClick={() => router.push('/historico')} style={{ width: '100%' }}>Ver histórico</MButton>
                <MButtonGhost onClick={resetToSelect} style={{ width: '100%' }}>Nova vistoria</MButtonGhost>
              </div>
            </div>
          )}
        </div>

        {/*
          Vistoria interrompida.

          A escolha é da pessoa, e as duas saídas são explícitas: continuar de
          onde parou, ou começar de novo — que apaga o que estava guardado. Sem
          a pergunta, retomar sozinho seria pior: quem quis recomeçar veria a
          vistoria de ontem de volta sem entender por quê.
        */}
        <Modal
          open={!!resumable}
          onClose={() => setResumable(null)}
          title="Vistoria interrompida"
        >
          <p style={{ color: M.mute, fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
            Você tem uma vistoria deste prédio começada e não enviada
            {resumable ? `, com ${Object.keys(resumable.drafts ?? {}).length} de ${resumable.floors.length} andares preenchidos` : ''}.
            Quer continuar de onde parou?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MButton onClick={handleResume} style={{ width: '100%' }}>Continuar vistoria</MButton>
            <MButtonGhost onClick={handleDiscardDraft} tone="danger" style={{ width: '100%' }}>
              Descartar e começar de novo
            </MButtonGhost>
          </div>
        </Modal>

        <UnsavedChangesModal
          open={saida.asking}
          message={
            currentIndex > 0
              ? 'Este andar tem ocorrências preenchidas e ainda não enviadas. Voltar agora as perde.'
              : 'Este andar tem ocorrências preenchidas e ainda não enviadas. Voltar agora encerra a vistoria e apaga o que foi guardado.'
          }
          onConfirm={saida.confirm}
          onCancel={saida.cancel}
        />
      </div>
    </RouteGuard>
  );
}
