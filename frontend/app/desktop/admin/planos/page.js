'use client';
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Building2,
  CheckCircle2,
  ChevronRight,
  Crown,
  HardDrive,
  Mail,
  RefreshCw,
  Search,
  Snowflake,
  Sparkles,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Avatar } from '@/app/components/Avatar';
import { Badge, Button, Card, Dialog, Input, Modal, Select, Skeleton } from '@/app/components/ui';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { useToastStore } from '@/app/store/toast';
import { useExitTransition, useKeepWhileClosing } from '@/app/hooks/useExitTransition';
import {
  useBuildings,
  useGrantPlan,
  useManagerPlan,
  useManagers,
  useRevokeGrant,
  useSetBuildingFreeze,
  useSetSuspension,
} from '@/app/hooks/useApi';
import { mensagemDoErro } from '@/app/lib/erros';
import { nomeDoPlano } from '@/app/lib/planos';
import { CONTENT_ID } from '@/app/components/mobile/kit';
import { T, R, W, NUM } from '@/app/lib/theme';

const DE_ONDE_VEM = {
  CONCESSAO: 'Concessão do suporte',
  ASSINATURA: 'Assinatura no Stripe',
  PADRAO: 'Nenhuma — plano padrão',
};

const GB = 1024 ** 3;

function emGigas(bytes) {
  if (!bytes) return '0 GB';
  const gigas = bytes / GB;
  return gigas < 0.1 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${gigas.toFixed(1)} GB`;
}

function dataCurta(valor) {
  return valor ? new Date(valor).toLocaleDateString('pt-BR') : '—';
}

/** O estado de uma concessão, em uma palavra — e por que ela não vale mais. */
function estadoDaConcessao(grant) {
  if (grant.revoked_at) return { label: `Revogada em ${dataCurta(grant.revoked_at)}`, variant: 'default' };
  if (grant.expires_at && new Date(grant.expires_at) <= new Date()) {
    return { label: `Venceu em ${dataCurta(grant.expires_at)}`, variant: 'default' };
  }
  if (grant.expires_at) return { label: `Vale até ${dataCurta(grant.expires_at)}`, variant: 'success' };
  return { label: 'Sem prazo', variant: 'success' };
}

function PlanoBadge({ plan }) {
  const code = typeof plan === 'string' ? plan : plan?.code ?? 'LIVRE';
  const name = nomeDoPlano(code);
  const isConcessao = plan?.source === 'CONCESSAO';

  if (code === 'PRO' || code === 'ESSENCIAL') {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Badge variant="accent">{name}</Badge>
        {isConcessao && <span style={{ color: T.mute, fontSize: 11 }}>cortesia</span>}
      </div>
    );
  }
  return <Badge variant="default">{name}</Badge>;
}

function ConcederModal({ open, gestor, onClose }) {
  const { show: toast } = useToastStore();
  const conceder = useGrantPlan();

  const [plan, setPlan] = useState('ESSENCIAL');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('30');

  function fechar() {
    setPlan('ESSENCIAL');
    setReason('');
    setDays('30');
    onClose();
  }

  async function enviar() {
    if (reason.trim().length < 3) {
      toast('Escreva o motivo da concessão', 'error');
      return;
    }

    const numDays = days.trim() ? Number(days) : undefined;
    if (numDays !== undefined && (isNaN(numDays) || numDays <= 0)) {
      toast('O prazo precisa ser de ao menos 1 dia (ou deixe em branco para sem prazo)', 'error');
      return;
    }

    const planCode =
      typeof plan === 'object' && plan !== null ? (plan.target?.value ?? plan.value) : plan;

    try {
      await conceder.mutateAsync({
        managerId: gestor.id,
        plan: planCode,
        reason: reason.trim(),
        ...(numDays ? { days: numDays } : {}),
      });
      toast(`${nomeDoPlano(planCode)} concedido a ${gestor.name}`, 'success');
      fechar();
    } catch (err) {
      toast(mensagemDoErro(err, 'Não foi possível conceder'), 'error');
    }
  }

  return (
    <Modal open={open} onClose={fechar} title={`Conceder plano — ${gestor?.name ?? ''}`} maxWidth={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Select
          label="Plano"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          options={[
            { value: 'LIVRE', label: 'Livre' },
            { value: 'ESSENCIAL', label: 'Essencial' },
            { value: 'PRO', label: 'Pro' },
          ]}
        />

        <Input
          label="Motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: cobrança travada, parceria, teste de duas semanas"
        />

        <Input
          label="Prazo em dias (vazio = sem prazo)"
          value={days}
          inputMode="numeric"
          onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
          placeholder="30"
        />

        <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.6 }}>
          A concessão vence a assinatura do Stripe enquanto valer, e não mexe no que o cliente
          contratou. O motivo fica na trilha de auditoria.
        </p>

        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="secondary" style={{ flex: 1 }} onClick={fechar}>
            Cancelar
          </Button>
          <Button style={{ flex: 1 }} loading={conceder.isPending} onClick={enviar}>
            Conceder
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Modal de detalhes ocupando 2/3 da tela, alinhado à direita conforme o anexo */
function GestorDetalhesModal({ gestor, open, onClose, onConceder }) {
  const { show: toast } = useToastStore();
  const DRAWER_EXIT_MS = 200;
  const { mounted, closing } = useExitTransition(open, DRAWER_EXIT_MS);
  const shownGestor = useKeepWhileClosing(gestor, open);

  const { data, isLoading } = useManagerPlan(shownGestor?.id);
  const { data: todosOsPredios = [] } = useBuildings();
  const revogar = useRevokeGrant();
  const suspender = useSetSuspension();
  const congelar = useSetBuildingFreeze();

  const [confirmacao, setConfirmacao] = useState(null);

  if (!mounted || !shownGestor) return null;

  const suspenso = !!shownGestor.suspended_at;
  const predios = todosOsPredios.filter((p) => p.owner_manager_id === shownGestor.id);

  async function alternarSuspensao() {
    try {
      await suspender.mutateAsync({ managerId: shownGestor.id, suspended: !suspenso });
      toast(suspenso ? 'Conta liberada' : 'Conta suspensa', suspenso ? 'success' : 'info');
    } catch (err) {
      toast(mensagemDoErro(err), 'error');
    } finally {
      setConfirmacao(null);
    }
  }

  async function alternarCongelamento(predio) {
    try {
      await congelar.mutateAsync({ buildingId: predio.id, frozen: !predio.frozen_at });
      toast(predio.frozen_at ? 'Prédio reativado' : 'Prédio inativado', 'info');
    } catch (err) {
      toast(mensagemDoErro(err), 'error');
    } finally {
      setConfirmacao(null);
    }
  }

  return (
    <>
      <Dialog
        onClose={onClose}
        className={`dialog-drawer ${closing ? 'is-closing' : ''}`}
        style={{
          width: 'clamp(640px, 66.66vw, 1100px)',
          maxWidth: '100vw',
          height: '100vh',
          maxHeight: '100vh',
          margin: '0 0 0 auto',
          background: 'transparent',
          padding: 0,
          border: 'none',
          outline: 'none',
        }}
      >
        <div
          className={closing ? 'anim-slide-out-right' : 'anim-slide-in-right'}
          style={{
            background: T.card,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-12px 0 36px rgba(0, 0, 0, 0.18)',
            borderLeft: `1px solid ${T.line}`,
            borderRadius: '16px 0 0 16px',
            overflow: 'hidden',
          }}
        >
          {/* Header com seta de voltar no canto superior esquerdo */}
          <div
            style={{
              padding: '16px 28px',
              borderBottom: `1px solid ${T.line}`,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              background: T.card,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={onClose}
                aria-label="Voltar para a lista de gestores"
                className="drawer-back-btn"
              >
                <ArrowLeft size={17} />
              </button>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2
                    style={{
                      fontSize: 17,
                      fontWeight: W.title,
                      color: T.text,
                      margin: 0,
                      fontFamily: T.display,
                    }}
                  >
                    {shownGestor.name}
                  </h2>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: W.strong,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      padding: '1px 7px',
                      borderRadius: R.badge,
                      background: T.chip,
                      color: T.mute,
                      border: '1px solid var(--border-soft)',
                    }}
                  >
                    Gestor
                  </span>
                </div>
                <p style={{ color: T.mute, fontSize: 12, margin: '2px 0 0' }}>
                  Gerenciamento de plano, consumo de recursos e controle de prédios
                </p>
              </div>
            </div>
          </div>

          {/* Miolo que rola */}
          <div style={{ overflowY: 'auto', minHeight: 0, padding: '20px 28px 36px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Cabeçalho do Gestor (Área de fundo mais claro com altura reduzida) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                background: T.chip,
                padding: '9px 16px',
                borderRadius: R.control,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <Avatar user={shownGestor} size={34} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: W.title, color: T.text, lineHeight: 1.2 }}>
                    {shownGestor.name}
                  </span>
                  <span style={{ color: T.mute, fontSize: 12, lineHeight: 1.2 }}>
                    {shownGestor.email} · Cadastrado em {dataCurta(shownGestor.created_at)}
                  </span>
                </div>
              </div>

              {/* Status da Conta e Ação de Suspensão compactos */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 9px',
                    borderRadius: R.badge,
                    fontSize: 11,
                    fontWeight: W.strong,
                    background: suspenso ? T.dangerSoft : 'rgba(34, 197, 94, 0.1)',
                    color: suspenso ? T.danger : T.success,
                    border: `1px solid ${suspenso ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                    height: 26,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: suspenso ? T.danger : T.success,
                    }}
                  />
                  {suspenso ? 'Conta Suspensa' : 'Conta Ativa'}
                </span>

                <Button
                  variant={suspenso ? 'secondary' : 'danger'}
                  style={{ padding: '3px 10px', fontSize: 11, height: 26 }}
                  onClick={() =>
                    setConfirmacao({
                      titulo: suspenso ? 'Liberar a conta?' : 'Suspender a conta?',
                      mensagem: suspenso
                        ? `${shownGestor.name} volta a entrar normalmente no sistema.`
                        : `${shownGestor.name} deixa de entrar e de renovar a sessão. Os prédios continuam existindo.`,
                      confirmar: suspenso ? 'Liberar' : 'Suspender',
                      acao: alternarSuspensao,
                    })
                  }
                >
                  {suspenso ? <Undo2 size={13} style={{ marginRight: 4 }} /> : <Ban size={13} style={{ marginRight: 4 }} />}
                  {suspenso ? 'Liberar acesso' : 'Suspender acesso'}
                </Button>
              </div>
            </div>

            {isLoading || !data ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Skeleton style={{ height: 60 }} />
                <Skeleton style={{ height: 80 }} />
                <Skeleton style={{ height: 100 }} />
              </div>
            ) : (
              <>
                {/* Plano Atual & Ação Comercial */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <span style={{ fontSize: 11, color: T.mute, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Plano Atual
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 22, fontWeight: W.title, color: T.text, fontFamily: T.display }}>
                        {data.plan.name}
                      </span>
                      <span style={{ color: T.mute, fontSize: 13 }}>
                        · {DE_ONDE_VEM[data.plan.source]}
                      </span>
                    </div>
                    <p style={{ color: T.mute, fontSize: 12, margin: '2px 0 0' }}>
                      Teto contratado: {data.plan.buildings_allowed} {data.plan.buildings_allowed === 1 ? 'prédio' : 'prédios'}
                      {data.plan.extra_buildings > 0 && ` (+${data.plan.extra_buildings} adicionais)`}
                    </p>
                  </div>

                  <Button style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => onConceder(shownGestor)}>
                    <Sparkles size={14} style={{ marginRight: 6 }} />
                    Conceder plano
                  </Button>
                </div>

                {/* Capacidade & Utilização */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: W.strong, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Capacidade & Utilização
                    </span>
                    <span style={{ fontSize: 11, color: T.mute }}>
                      Período: <strong style={{ color: T.text, fontWeight: W.strong, ...NUM }}>{data.usage.period}</strong>
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    }}
                  >
                    {/* Card 1: Prédios com barra visual minimalista */}
                    <div
                      style={{
                        background: T.chip,
                        borderRadius: R.control,
                        padding: '11px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 8,
                        minHeight: 78,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: T.text, fontSize: 12, fontWeight: W.body }}>
                          Prédios em uso
                        </span>
                        <span style={{ fontSize: 13, fontWeight: W.title, color: T.text, fontFamily: T.display, ...NUM }}>
                          {data.usage.buildings}/{data.plan.buildings_allowed}
                        </span>
                      </div>

                      {(() => {
                        const max = Math.max(data.plan.buildings_allowed, 1);
                        const pct = Math.min(100, Math.round((data.usage.buildings / max) * 100));
                        const isFull = pct >= 100;
                        return (
                          <div>
                            <div
                              style={{
                                height: 4,
                                width: '100%',
                                background: 'rgba(255, 255, 255, 0.08)',
                                borderRadius: 999,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  width: `${pct}%`,
                                  background: isFull ? T.danger : T.accent,
                                  borderRadius: 999,
                                  transition: 'width 0.25s ease',
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                              <span style={{ fontSize: 10, color: isFull ? T.danger : T.mute }}>
                                {isFull ? 'Cota esgotada' : `${pct}% utilizado`}
                              </span>
                              <span style={{ fontSize: 10, color: T.mute, ...NUM }}>
                                {Math.max(0, data.plan.buildings_allowed - data.usage.buildings)} livres
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Card 2: E-mails no período */}
                    <div
                      style={{
                        background: T.chip,
                        borderRadius: R.control,
                        padding: '11px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 6,
                        minHeight: 78,
                      }}
                    >
                      <span style={{ color: T.text, fontSize: 12, fontWeight: W.body }}>
                        E-mails no período
                      </span>
                      <div>
                        <div style={{ fontSize: 18, fontFamily: T.display, fontWeight: W.title, color: T.text, lineHeight: 1.1, ...NUM }}>
                          {data.usage.emails_this_month}
                        </div>
                        <span style={{ fontSize: 10, color: T.mute, marginTop: 2, display: 'block' }}>
                          Disparos em {data.usage.period}
                        </span>
                      </div>
                    </div>

                    {/* Card 3: Armazenamento */}
                    <div
                      style={{
                        background: T.chip,
                        borderRadius: R.control,
                        padding: '11px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 6,
                        minHeight: 78,
                      }}
                    >
                      <span style={{ color: T.text, fontSize: 12, fontWeight: W.body }}>
                        Armazenamento
                      </span>
                      <div>
                        <div style={{ fontSize: 18, fontFamily: T.display, fontWeight: W.title, color: T.text, lineHeight: 1.1, ...NUM }}>
                          {emGigas(data.usage.storage_bytes)}
                        </div>
                        <span style={{ fontSize: 10, color: T.mute, marginTop: 2, display: 'block' }}>
                          Fotos de vistorias e laudos
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Prédios vinculados */}
                <div>
                  <h4 style={{ fontSize: 11, fontWeight: W.strong, color: T.mute, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Prédios desta conta ({predios.length})
                  </h4>

                  {predios.length === 0 ? (
                    <p style={{ color: T.mute, fontSize: 13, padding: '4px 0', margin: 0 }}>
                      Esta conta ainda não gerencia nenhum prédio.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                      {predios.map((p) => {
                        const inativo = !!p.frozen_at;
                        return (
                          <div
                            key={p.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              background: T.chip,
                              borderRadius: R.control,
                              gap: 12,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontSize: 14, fontWeight: W.title, color: T.text }}>
                                {p.name}
                              </span>
                              <span style={{ color: T.mute, fontSize: 12, marginLeft: 8 }}>
                                {p.city ? `${p.city} - ${p.state}` : ''}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Badge variant={inativo ? 'danger' : 'success'}>
                                {inativo ? 'Inativo' : 'Ativo'}
                              </Badge>
                              <Button
                                variant="secondary"
                                style={{ padding: '4px 10px', fontSize: 12 }}
                                loading={congelar.isPending}
                                onClick={() =>
                                  setConfirmacao({
                                    titulo: inativo ? 'Reativar prédio?' : 'Inativar prédio?',
                                    mensagem: inativo
                                      ? `O prédio "${p.name}" volta a ser visível e editável.`
                                      : `O prédio "${p.name}" fica congelado no painel do gestor.`,
                                    confirmar: inativo ? 'Reativar' : 'Inativar',
                                    acao: () => alternarCongelamento(p),
                                  })
                                }
                              >
                                <Snowflake size={13} style={{ marginRight: 4 }} />
                                {inativo ? 'Reativar' : 'Inativar'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Histórico de Concessões */}
                <div>
                  <h4 style={{ fontSize: 11, fontWeight: W.strong, color: T.mute, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Histórico de Concessões ({data.grants.length})
                  </h4>

                  {data.grants.length === 0 ? (
                    <p style={{ color: T.mute, fontSize: 13, padding: '4px 0', margin: 0 }}>
                      Nenhuma concessão registrada para esta conta.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                      {data.grants.map((grant) => {
                        const estado = estadoDaConcessao(grant);
                        const ativa = estado.variant === 'success';

                        return (
                          <div
                            key={grant.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              background: T.chip,
                              borderRadius: R.control,
                              gap: 12,
                              flexWrap: 'wrap',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: T.text, fontSize: 14, fontWeight: W.title }}>
                                  {nomeDoPlano(grant.plan)}
                                </span>
                                <Badge variant={estado.variant}>{estado.label}</Badge>
                              </div>
                              <p style={{ color: T.mute, fontSize: 12, margin: '2px 0 0' }}>
                                {grant.reason} · registrada em {dataCurta(grant.created_at)}
                              </p>
                            </div>

                            {ativa && (
                              <Button
                                variant="secondary"
                                style={{ padding: '5px 12px', fontSize: 12 }}
                                loading={revogar.isPending}
                                onClick={() =>
                                  setConfirmacao({
                                    titulo: `Revogar concessão ${nomeDoPlano(grant.plan)}?`,
                                    mensagem: `A concessão será cancelada e a conta de ${shownGestor.name} voltará imediatamente para o plano Livre.`,
                                    confirmar: 'Revogar concessão',
                                    acao: async () => {
                                      try {
                                        await revogar.mutateAsync({ grantId: grant.id, managerId: shownGestor.id });
                                        toast('Concessão revogada. A conta voltou para o Livre.', 'info');
                                      } catch (err) {
                                        toast(mensagemDoErro(err), 'error');
                                      } finally {
                                        setConfirmacao(null);
                                      }
                                    },
                                  })
                                }
                              >
                                Revogar
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </Dialog>

      <ConfirmModal
        open={!!confirmacao}
        title={confirmacao?.titulo}
        message={confirmacao?.mensagem}
        confirmLabel={confirmacao?.confirmar}
        confirmVariant="danger"
        loading={suspender.isPending || congelar.isPending || revogar.isPending}
        onConfirm={() => confirmacao?.acao()}
        onCancel={() => setConfirmacao(null)}
      />
    </>
  );
}

export default function AdminPlanosPage() {
  const [busca, setBusca] = useState('');
  const [filtroPlano, setFiltroPlano] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  const [gestorSelecionado, setGestorSelecionado] = useState(null);
  const [concedendoGestor, setConcedendoGestor] = useState(null);

  const { data: managersData, isLoading, refetch, isFetching } = useManagers(1);
  const gestores = useMemo(
    () => managersData?.managers ?? managersData?.data ?? [],
    [managersData]
  );

  // Contadores e métricas de distribuição para os cards do topo
  const contadores = useMemo(() => {
    let livre = 0;
    let essencial = 0;
    let pro = 0;
    let suspensos = 0;

    for (const g of gestores) {
      if (g.suspended_at) suspensos++;
      const code = g.plan?.code;
      if (code === 'PRO') pro++;
      else if (code === 'ESSENCIAL') essencial++;
      else livre++;
    }

    const total = gestores.length;
    const pctLivre = total > 0 ? Math.round((livre / total) * 100) : 0;
    const pctEssencial = total > 0 ? Math.round((essencial / total) * 100) : 0;
    const pctPro = total > 0 ? Math.round((pro / total) * 100) : 0;

    return { total, livre, essencial, pro, suspensos, pctLivre, pctEssencial, pctPro };
  }, [gestores]);

  // Gestores filtrados
  const gestoresFiltrados = useMemo(() => {
    return gestores.filter((gestor) => {
      const termo = busca.trim().toLowerCase();
      const matchBusca =
        !termo ||
        gestor.name?.toLowerCase().includes(termo) ||
        gestor.email?.toLowerCase().includes(termo);

      const planoGestor = gestor.plan?.code ?? 'LIVRE';
      const matchPlano = !filtroPlano || planoGestor === filtroPlano;

      const statusGestor = gestor.suspended_at ? 'SUSPENSO' : 'ATIVO';
      const matchStatus = !filtroStatus || statusGestor === filtroStatus;

      return matchBusca && matchPlano && matchStatus;
    });
  }, [gestores, busca, filtroPlano, filtroStatus]);

  const temFiltroAtivo = Boolean(busca.trim() || filtroPlano || filtroStatus);

  function limparFiltros() {
    setBusca('');
    setFiltroPlano('');
    setFiltroStatus('');
  }

  return (
    <RouteGuard roles={['ADMIN']}>
      <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>
        <AdminSidebar />

        <main id={CONTENT_ID} className="planos-main">
          {/* Cabeçalho */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: T.display, fontSize: 24, fontWeight: W.title, color: T.text }}>
                Planos & Gestores
              </h1>
              <p style={{ color: T.mute, fontSize: 14, marginTop: 4 }}>
                Acompanhe o plano atual, histórico de concessões e consumo de recursos de cada gestor.
              </p>
            </div>

            <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
              <RefreshCw size={15} style={{ marginRight: 6 }} />
              Atualizar
            </Button>
          </div>

          {/* Cards de Métricas e Filtro Rápido no Topo */}
          <div className="planos-kpi-grid">
            {/* 1. Total de Gestores */}
            <div
              role="button"
              tabIndex={0}
              aria-pressed={!filtroPlano}
              onClick={() => setFiltroPlano('')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFiltroPlano('');
                }
              }}
              className={`kpi-card anim-fade-up anim-d1 ${!filtroPlano ? 'is-active' : ''}`}
              title="Exibir todos os gestores"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span
                    className="rotulo-topo"
                    style={{ fontSize: 11, fontWeight: W.strong, color: T.mute, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
                  >
                    Total de Gestores
                  </span>
                  <Users size={12} color={T.mute} aria-hidden="true" style={{ flexShrink: 0 }} />
                </div>
              </div>

              <div style={{ margin: '12px 0 8px' }}>
                {isLoading ? (
                  <Skeleton style={{ height: 34, width: 56 }} />
                ) : (
                  <p style={{ fontSize: 34, lineHeight: '36px', fontWeight: W.title, fontFamily: T.display, color: T.text, ...NUM }}>
                    {contadores.total}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minHeight: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.faint, lineHeight: '16px', minWidth: 0 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: contadores.suspensos > 0 ? T.danger : T.success,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {contadores.total - contadores.suspensos} {contadores.total - contadores.suspensos === 1 ? 'ativo' : 'ativos'}
                    {contadores.suspensos > 0 ? ` · ${contadores.suspensos} susp.` : ' · 0 suspensos'}
                  </span>
                </div>
                {!filtroPlano && (
                  <span style={{ fontSize: 10, fontWeight: W.strong, color: T.accentInk, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                    Todos
                  </span>
                )}
              </div>

              <div style={{ height: 3, width: '100%', borderRadius: 999, background: T.chip, overflow: 'hidden', marginTop: 10 }}>
                <div style={{ height: '100%', width: '100%', background: 'rgba(255, 255, 255, 0.22)', borderRadius: 999 }} />
              </div>
            </div>

            {/* 2. Plano Livre */}
            <div
              role="button"
              tabIndex={0}
              aria-pressed={filtroPlano === 'LIVRE'}
              onClick={() => setFiltroPlano((atual) => (atual === 'LIVRE' ? '' : 'LIVRE'))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFiltroPlano((atual) => (atual === 'LIVRE' ? '' : 'LIVRE'));
                }
              }}
              className={`kpi-card anim-fade-up anim-d2 ${filtroPlano === 'LIVRE' ? 'is-active' : ''}`}
              title="Filtrar por Plano Livre"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 20 }}>
                <span
                  className="rotulo-topo"
                  style={{ fontSize: 11, fontWeight: W.strong, color: T.mute, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
                >
                  Plano Livre
                </span>
              </div>

              <div style={{ margin: '12px 0 8px' }}>
                {isLoading ? (
                  <Skeleton style={{ height: 34, width: 56 }} />
                ) : (
                  <p style={{ fontSize: 34, lineHeight: '36px', fontWeight: W.title, fontFamily: T.display, color: T.text, ...NUM }}>
                    {contadores.livre}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 11, color: T.faint, lineHeight: '16px', minHeight: 16 }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Gratuito · 1 prédio incluso</span>
                {filtroPlano === 'LIVRE' && (
                  <span style={{ fontSize: 10, fontWeight: W.strong, color: T.accentInk, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                    Filtrando
                  </span>
                )}
              </div>

              <div style={{ height: 3, width: '100%', borderRadius: 999, background: T.chip, overflow: 'hidden', marginTop: 10 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${contadores.pctLivre}%`,
                    background: 'rgba(255, 255, 255, 0.5)',
                    borderRadius: 999,
                    transition: 'width 300ms var(--ease-saida)',
                  }}
                />
              </div>
            </div>

            {/* 3. Plano Essencial */}
            <div
              role="button"
              tabIndex={0}
              aria-pressed={filtroPlano === 'ESSENCIAL'}
              onClick={() => setFiltroPlano((atual) => (atual === 'ESSENCIAL' ? '' : 'ESSENCIAL'))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFiltroPlano((atual) => (atual === 'ESSENCIAL' ? '' : 'ESSENCIAL'));
                }
              }}
              className={`kpi-card anim-fade-up anim-d3 ${filtroPlano === 'ESSENCIAL' ? 'is-active' : ''}`}
              title="Filtrar por Plano Essencial"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 20 }}>
                <span
                  className="rotulo-topo"
                  style={{ fontSize: 11, fontWeight: W.strong, color: T.mute, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
                >
                  Plano Essencial
                </span>
              </div>

              <div style={{ margin: '12px 0 8px' }}>
                {isLoading ? (
                  <Skeleton style={{ height: 34, width: 56 }} />
                ) : (
                  <p
                    style={{
                      fontSize: 34,
                      lineHeight: '36px',
                      fontWeight: W.title,
                      fontFamily: T.display,
                      color: contadores.essencial > 0 ? T.text : T.mute,
                      ...NUM,
                    }}
                  >
                    {contadores.essencial}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 11, color: T.faint, lineHeight: '16px', minHeight: 16 }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>R$ 79/mês · até 3 prédios</span>
                {filtroPlano === 'ESSENCIAL' && (
                  <span style={{ fontSize: 10, fontWeight: W.strong, color: T.accentInk, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                    Filtrando
                  </span>
                )}
              </div>

              <div style={{ height: 3, width: '100%', borderRadius: 999, background: T.chip, overflow: 'hidden', marginTop: 10 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${contadores.pctEssencial}%`,
                    background: T.info,
                    borderRadius: 999,
                    transition: 'width 300ms var(--ease-saida)',
                  }}
                />
              </div>
            </div>

            {/* 4. Plano Pro */}
            <div
              role="button"
              tabIndex={0}
              aria-pressed={filtroPlano === 'PRO'}
              onClick={() => setFiltroPlano((atual) => (atual === 'PRO' ? '' : 'PRO'))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFiltroPlano((atual) => (atual === 'PRO' ? '' : 'PRO'));
                }
              }}
              className={`kpi-card anim-fade-up anim-d4 ${filtroPlano === 'PRO' ? 'is-active' : ''}`}
              title="Filtrar por Plano Pro"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span
                    className="rotulo-topo"
                    style={{ fontSize: 11, fontWeight: W.strong, color: T.mute, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
                  >
                    Plano Pro
                  </span>
                  <Crown size={12} color={T.accentInk} aria-hidden="true" style={{ flexShrink: 0 }} />
                </div>
              </div>

              <div style={{ margin: '12px 0 8px' }}>
                {isLoading ? (
                  <Skeleton style={{ height: 34, width: 56 }} />
                ) : (
                  <p
                    style={{
                      fontSize: 34,
                      lineHeight: '36px',
                      fontWeight: W.title,
                      fontFamily: T.display,
                      color: contadores.pro > 0 ? T.accentInk : T.mute,
                      ...NUM,
                    }}
                  >
                    {contadores.pro}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 11, color: T.faint, lineHeight: '16px', minHeight: 16 }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>R$ 249/mês · até 25 prédios</span>
                {filtroPlano === 'PRO' && (
                  <span style={{ fontSize: 10, fontWeight: W.strong, color: T.accentInk, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                    Filtrando
                  </span>
                )}
              </div>

              <div style={{ height: 3, width: '100%', borderRadius: 999, background: T.chip, overflow: 'hidden', marginTop: 10 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${contadores.pctPro}%`,
                    background: T.accent,
                    borderRadius: 999,
                    transition: 'width 300ms var(--ease-saida)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Barra de Filtros */}
          <Card style={{ padding: '14px 18px', marginBottom: 20 }}>
            <div className="planos-filter-bar">
              {/* Campo de Busca */}
              <div className="planos-search-box" style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <Search
                  size={16}
                  color={T.faint}
                  style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar gestor por nome ou e-mail..."
                  aria-label="Buscar gestor"
                  style={{
                    width: '100%',
                    background: T.chip,
                    border: '1px solid var(--border-soft)',
                    borderRadius: R.pill,
                    padding: '10px 14px 10px 38px',
                    color: T.text,
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: T.mute, cursor: 'pointer' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="planos-select-group">
                {/* Filtro por Plano */}
                <div style={{ width: 165 }}>
                  <Select
                    value={filtroPlano}
                    onChange={(e) => setFiltroPlano(e.target.value)}
                    placeholder="Todos os planos"
                    aria-label="Filtrar por plano"
                    options={[
                      { value: '', label: 'Todos os planos' },
                      { value: 'LIVRE', label: 'Livre' },
                      { value: 'ESSENCIAL', label: 'Essencial' },
                      { value: 'PRO', label: 'Pro' },
                    ]}
                    style={{ padding: '9px 34px 9px 12px', fontSize: 13 }}
                  />
                </div>

                {/* Filtro por Status */}
                <div style={{ width: 165 }}>
                  <Select
                    value={filtroStatus}
                    onChange={(e) => setFiltroStatus(e.target.value)}
                    placeholder="Todos os status"
                    aria-label="Filtrar por status"
                    options={[
                      { value: '', label: 'Todos os status' },
                      { value: 'ATIVO', label: 'Ativos' },
                      { value: 'SUSPENSO', label: 'Suspensos' },
                    ]}
                    style={{ padding: '9px 34px 9px 12px', fontSize: 13 }}
                  />
                </div>
              </div>

              {temFiltroAtivo && (
                <Button variant="ghost" onClick={limparFiltros} style={{ fontSize: 13, padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  Limpar filtros
                </Button>
              )}
            </div>
          </Card>

          {/* Tabela de Gestores */}
          <div className="planos-table-wrapper">
            <table className="planos-table">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', background: 'transparent' }}>
                  <th style={{ color: T.mute, fontSize: 11, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Gestor
                  </th>
                  <th className="col-cadastro" style={{ color: T.mute, fontSize: 11, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Cadastro
                  </th>
                  <th style={{ color: T.mute, fontSize: 11, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Prédios
                  </th>
                  <th style={{ color: T.mute, fontSize: 11, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Plano Atual
                  </th>
                  <th style={{ color: T.mute, fontSize: 11, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Status
                  </th>
                  <th style={{ color: T.mute, fontSize: 11, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  [1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                      <td><Skeleton style={{ height: 36, width: 190 }} /></td>
                      <td className="col-cadastro"><Skeleton style={{ height: 20, width: 80 }} /></td>
                      <td><Skeleton style={{ height: 20, width: 70 }} /></td>
                      <td><Skeleton style={{ height: 24, width: 90 }} /></td>
                      <td><Skeleton style={{ height: 24, width: 70 }} /></td>
                      <td style={{ textAlign: 'right' }}><Skeleton style={{ height: 30, width: 86, marginLeft: 'auto' }} /></td>
                    </tr>
                  ))}

                {!isLoading && gestoresFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center' }}>
                      <Users size={32} color={T.faint} style={{ margin: '0 auto 12px' }} />
                      <p style={{ color: T.text, fontSize: 15, fontWeight: W.title }}>
                        Nenhum gestor encontrado
                      </p>
                      <p style={{ color: T.mute, fontSize: 13, marginTop: 4 }}>
                        Tente mudar os termos da busca ou limpar os filtros aplicados.
                      </p>
                      {temFiltroAtivo && (
                        <Button variant="secondary" onClick={limparFiltros} style={{ marginTop: 14 }}>
                          Limpar filtros
                        </Button>
                      )}
                    </td>
                  </tr>
                )}

                {!isLoading &&
                  gestoresFiltrados.map((gestor) => {
                    const suspenso = !!gestor.suspended_at;
                    const qtdPredios = gestor.buildings ?? 0;

                    return (
                      <tr
                        key={gestor.id}
                        onClick={() => setGestorSelecionado(gestor)}
                        style={{
                          borderBottom: '1px solid var(--border-soft)',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = T.chip)}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {/* Coluna 1: Gestor */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar user={gestor} size={34} />
                            <div style={{ minWidth: 0, maxWidth: 185 }}>
                              <span style={{ display: 'block', color: T.text, fontSize: 13, fontWeight: W.title, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {gestor.name}
                              </span>
                              <span style={{ display: 'block', color: T.mute, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {gestor.email}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Coluna 2: Cadastro */}
                        <td className="col-cadastro" style={{ color: T.mute, fontSize: 12, ...NUM }}>
                          {dataCurta(gestor.created_at)}
                        </td>

                        {/* Coluna 3: Prédios */}
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: R.pill,
                              background: T.chip,
                              color: qtdPredios > 0 ? T.text : T.faint,
                              fontSize: 12,
                              fontWeight: W.strong,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Building2 size={13} style={{ flexShrink: 0 }} />
                            {qtdPredios} {qtdPredios === 1 ? 'prédio' : 'prédios'}
                          </span>
                        </td>

                        {/* Coluna 4: Plano Atual */}
                        <td>
                          <PlanoBadge plan={gestor.plan} />
                        </td>

                        {/* Coluna 5: Status */}
                        <td>
                          <Badge variant={suspenso ? 'danger' : 'success'}>
                            {suspenso ? 'Suspenso' : 'Ativo'}
                          </Badge>
                        </td>

                        {/* Coluna 6: Ações */}
                        <td style={{ textAlign: 'right' }}>
                          <Button
                            variant="secondary"
                            style={{ padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setGestorSelecionado(gestor);
                            }}
                          >
                            Gerenciar
                            <ChevronRight size={14} style={{ marginLeft: 4 }} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Lista Vertical de Gestores para Modo Responsivo */}
          <div className="planos-mobile-list">
            {isLoading &&
              [1, 2, 3].map((i) => (
                <div key={i} className="kpi-card" style={{ padding: '16px 18px', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Skeleton style={{ height: 38, width: 38, borderRadius: '50%' }} />
                    <div style={{ flex: 1 }}>
                      <Skeleton style={{ height: 16, width: 140, marginBottom: 6 }} />
                      <Skeleton style={{ height: 12, width: 180 }} />
                    </div>
                  </div>
                  <Skeleton style={{ height: 32, width: '100%', borderRadius: 8 }} />
                </div>
              ))}

            {!isLoading && gestoresFiltrados.length === 0 && (
              <div style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: '40px 20px', textAlign: 'center' }}>
                <Users size={32} color={T.faint} style={{ margin: '0 auto 12px' }} />
                <p style={{ color: T.text, fontSize: 15, fontWeight: W.title }}>
                  Nenhum gestor encontrado
                </p>
                <p style={{ color: T.mute, fontSize: 13, marginTop: 4 }}>
                  Tente mudar os termos da busca ou limpar os filtros aplicados.
                </p>
                {temFiltroAtivo && (
                  <Button variant="secondary" onClick={limparFiltros} style={{ marginTop: 14 }}>
                    Limpar filtros
                  </Button>
                )}
              </div>
            )}

            {!isLoading &&
              gestoresFiltrados.map((gestor) => {
                const suspenso = !!gestor.suspended_at;
                const qtdPredios = gestor.buildings ?? 0;

                return (
                  <div
                    key={gestor.id}
                    onClick={() => setGestorSelecionado(gestor)}
                    className="kpi-card"
                    style={{
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {/* Linha 1: Gestor (Avatar, Nome, Email) + Status */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <Avatar user={gestor} size={38} />
                        <div style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', color: T.text, fontSize: 14, fontWeight: W.title, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {gestor.name}
                          </span>
                          <span style={{ display: 'block', color: T.mute, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {gestor.email}
                          </span>
                        </div>
                      </div>
                      <Badge variant={suspenso ? 'danger' : 'success'} style={{ flexShrink: 0 }}>
                        {suspenso ? 'Suspenso' : 'Ativo'}
                      </Badge>
                    </div>

                    {/* Linha 2: Metadados (Plano, Prédios, Data de Cadastro) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border-soft)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <PlanoBadge plan={gestor.plan} />
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 9px',
                            borderRadius: R.pill,
                            background: T.chip,
                            color: qtdPredios > 0 ? T.text : T.faint,
                            fontSize: 12,
                            fontWeight: W.strong,
                          }}
                        >
                          <Building2 size={13} style={{ flexShrink: 0 }} />
                          {qtdPredios} {qtdPredios === 1 ? 'prédio' : 'prédios'}
                        </span>
                      </div>

                      <span style={{ color: T.mute, fontSize: 11, ...NUM }}>
                        Cadastrado em {dataCurta(gestor.created_at)}
                      </span>
                    </div>

                    {/* Linha 3: Botão de Ação */}
                    <Button
                      variant="secondary"
                      style={{ width: '100%', justifyContent: 'center', padding: '8px 12px', fontSize: 13, marginTop: 2 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setGestorSelecionado(gestor);
                      }}
                    >
                      Gerenciar
                      <ChevronRight size={14} style={{ marginLeft: 4 }} />
                    </Button>
                  </div>
                );
              })}
          </div>

          <p style={{ color: T.faint, fontSize: 12, marginTop: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={13} aria-hidden="true" />
            Toda concessão, suspensão ou congelamento entra na trilha de auditoria com autor, data e motivo.
          </p>

          {/* Modal de Detalhes do Gestor (cobre 2/3 da tela) */}
          <GestorDetalhesModal
            gestor={gestorSelecionado}
            open={!!gestorSelecionado}
            onClose={() => setGestorSelecionado(null)}
            onConceder={(g) => setConcedendoGestor(g)}
          />

          {/* Modal de Concessão de Plano */}
          <ConcederModal
            gestor={concedendoGestor}
            open={!!concedendoGestor}
            onClose={() => setConcedendoGestor(null)}
          />
        </main>
      </div>
    </RouteGuard>
  );
}
