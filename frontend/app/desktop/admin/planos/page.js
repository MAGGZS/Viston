'use client';
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Building2,
  CheckCircle2,
  ChevronRight,
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
import { T, R, W } from '@/app/lib/theme';

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
  const { mounted, closing } = useExitTransition(open);
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
        className={closing ? 'is-closing' : ''}
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
            borderLeft: '1px solid var(--border-soft)',
            borderRadius: '16px 0 0 16px',
            overflow: 'hidden',
          }}
        >
          {/* Header com seta de voltar no canto superior esquerdo */}
          <div
            style={{
              padding: '20px 28px',
              borderBottom: '1px solid var(--border-soft)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              background: T.card,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                type="button"
                onClick={onClose}
                aria-label="Voltar para a lista de gestores"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 38,
                  height: 38,
                  borderRadius: R.control,
                  background: T.chip,
                  border: '1px solid var(--border-soft)',
                  color: T.text,
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'background-color 0.15s ease, transform 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = T.hover;
                  e.currentTarget.style.transform = 'translateX(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = T.chip;
                  e.currentTarget.style.transform = 'none';
                }}
              >
                <ArrowLeft size={18} />
              </button>

              <div>
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: T.text,
                    margin: 0,
                    fontFamily: T.display,
                  }}
                >
                  Gestor — {shownGestor.name}
                </h2>
                <p style={{ color: T.mute, fontSize: 13, marginTop: 2, margin: '2px 0 0' }}>
                  Gerenciamento de plano, consumo de recursos e controle de prédios
                </p>
              </div>
            </div>
          </div>

          {/* Miolo que rola */}
          <div style={{ overflowY: 'auto', minHeight: 0, padding: '24px 32px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Cabeçalho do Gestor */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                background: T.chip,
                padding: '14px 18px',
                borderRadius: R.control,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Avatar user={shownGestor} size={44} />
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: W.title, color: T.text, margin: 0 }}>
                    {shownGestor.name}
                  </h3>
                  <p style={{ color: T.mute, fontSize: 13, margin: '2px 0 0' }}>{shownGestor.email}</p>
                  <p style={{ color: T.faint, fontSize: 12, margin: '2px 0 0' }}>
                    Cadastrado em {dataCurta(shownGestor.created_at)}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {data && (
                  <Badge variant={data.plan.source === 'PADRAO' ? 'default' : 'accent'}>
                    {data.plan.name}
                  </Badge>
                )}
                <Badge variant={suspenso ? 'danger' : 'success'}>
                  {suspenso ? 'Conta Suspensa' : 'Conta Ativa'}
                </Badge>
              </div>
            </div>

            {isLoading || !data ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Skeleton style={{ height: 90 }} />
                <Skeleton style={{ height: 110 }} />
                <Skeleton style={{ height: 120 }} />
              </div>
            ) : (
              <>
                {/* Card 1: Plano Atual & Ações */}
                <div
                  style={{
                    background: T.card,
                    border: '1px solid var(--border-soft)',
                    borderRadius: R.control,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <span style={{ fontSize: 12, color: T.mute, fontWeight: W.body, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Plano Atual
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <span style={{ fontSize: 20, fontWeight: W.title, color: T.text, fontFamily: T.display }}>
                          {data.plan.name}
                        </span>
                        <span style={{ color: T.mute, fontSize: 13 }}>
                          · {DE_ONDE_VEM[data.plan.source]}
                        </span>
                      </div>
                      <p style={{ color: T.mute, fontSize: 13, marginTop: 4 }}>
                        Teto contratado: {data.plan.buildings_allowed} {data.plan.buildings_allowed === 1 ? 'prédio' : 'prédios'}
                        {data.plan.extra_buildings > 0 ? ` (+${data.plan.extra_buildings} extras)` : ''}
                      </p>
                    </div>

                    {/* Ações */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <Button onClick={() => onConceder(shownGestor)}>
                        <Sparkles size={15} style={{ marginRight: 6 }} />
                        Conceder plano
                      </Button>
                      <Button
                        variant={suspenso ? 'secondary' : 'danger'}
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
                        {suspenso ? <Undo2 size={15} style={{ marginRight: 6 }} /> : <Ban size={15} style={{ marginRight: 6 }} />}
                        {suspenso ? 'Liberar conta' : 'Suspender conta'}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Card 2: Consumo */}
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: W.title, color: T.mute, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Consumo de Recursos
                  </h4>
                  <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div style={{ background: T.chip, borderRadius: R.control, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.mute, fontSize: 12 }}>
                        <Building2 size={14} />
                        <span>Prédios</span>
                      </div>
                      <p style={{ color: T.text, fontSize: 18, fontFamily: T.display, fontWeight: W.title, marginTop: 4, margin: '4px 0 0' }}>
                        {data.usage.buildings} de {data.plan.buildings_allowed}
                      </p>
                    </div>

                    <div style={{ background: T.chip, borderRadius: R.control, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.mute, fontSize: 12 }}>
                        <Mail size={14} />
                        <span>E-mails em {data.usage.period}</span>
                      </div>
                      <p style={{ color: T.text, fontSize: 18, fontFamily: T.display, fontWeight: W.title, marginTop: 4, margin: '4px 0 0' }}>
                        {data.usage.emails_this_month}
                      </p>
                    </div>

                    <div style={{ background: T.chip, borderRadius: R.control, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.mute, fontSize: 12 }}>
                        <HardDrive size={14} />
                        <span>Fotos / Espaço</span>
                      </div>
                      <p style={{ color: T.text, fontSize: 18, fontFamily: T.display, fontWeight: W.title, marginTop: 4, margin: '4px 0 0' }}>
                        {emGigas(data.usage.storage_bytes)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card 3: Prédios Gerenciados */}
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: W.title, color: T.mute, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Prédios desta conta ({predios.length})
                  </h4>
                  {predios.length === 0 ? (
                    <p style={{ color: T.mute, fontSize: 13, padding: '8px 0', margin: 0 }}>
                      Esta conta ainda não gerencia nenhum prédio.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                      {predios.map((p) => (
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
                            <Badge variant={p.frozen_at ? 'danger' : 'success'}>
                              {p.frozen_at ? 'Inativo' : 'Ativo'}
                            </Badge>
                            <Button
                              variant="secondary"
                              style={{ padding: '4px 10px', fontSize: 12 }}
                              loading={congelar.isPending}
                              onClick={() =>
                                setConfirmacao({
                                  titulo: p.frozen_at ? 'Reativar prédio?' : 'Inativar prédio?',
                                  mensagem: p.frozen_at
                                    ? `O prédio "${p.name}" volta a ser visível e editável.`
                                    : `O prédio "${p.name}" fica congelado no painel do gestor.`,
                                  confirmar: p.frozen_at ? 'Reativar' : 'Inativar',
                                  acao: () => alternarCongelamento(p),
                                })
                              }
                            >
                              <Snowflake size={13} style={{ marginRight: 4 }} />
                              {p.frozen_at ? 'Reativar' : 'Inativar'}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card 4: Histórico de Concessões */}
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: W.title, color: T.mute, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Histórico de Concessões ({data.grants.length})
                  </h4>
                  {data.grants.length === 0 ? (
                    <p style={{ color: T.mute, fontSize: 13, padding: '8px 0', margin: 0 }}>
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
                              <p style={{ color: T.mute, fontSize: 12, marginTop: 2, margin: '2px 0 0' }}>
                                {grant.reason} · registrada em {dataCurta(grant.created_at)}
                              </p>
                            </div>

                            {ativa && (
                              <Button
                                variant="secondary"
                                style={{ padding: '6px 12px', fontSize: 12 }}
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

  // Contadores para os cards do topo
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

    return { total: gestores.length, livre, essencial, pro, suspensos };
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

        <main id={CONTENT_ID} style={{ flex: 1, padding: '32px 32px 64px', minWidth: 0 }}>
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

          {/* Cards de Resumo no Topo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
            <Card style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: T.chip, padding: 10, borderRadius: R.control, color: T.accentInk }}>
                <Users size={20} />
              </div>
              <div>
                <p style={{ fontSize: 12, color: T.mute }}>Total de Gestores</p>
                <p style={{ fontSize: 22, fontWeight: W.title, fontFamily: T.display, color: T.text, marginTop: 2 }}>
                  {contadores.total}
                </p>
              </div>
            </Card>

            <Card style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: T.chip, padding: 10, borderRadius: R.control, color: T.mute }}>
                <Building2 size={20} />
              </div>
              <div>
                <p style={{ fontSize: 12, color: T.mute }}>Plano Livre</p>
                <p style={{ fontSize: 22, fontWeight: W.title, fontFamily: T.display, color: T.text, marginTop: 2 }}>
                  {contadores.livre}
                </p>
              </div>
            </Card>

            <Card style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: 'var(--color-accent-soft)', padding: 10, borderRadius: R.control, color: 'var(--color-accent)' }}>
                <Sparkles size={20} />
              </div>
              <div>
                <p style={{ fontSize: 12, color: T.mute }}>Plano Essencial</p>
                <p style={{ fontSize: 22, fontWeight: W.title, fontFamily: T.display, color: T.text, marginTop: 2 }}>
                  {contadores.essencial}
                </p>
              </div>
            </Card>

            <Card style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: 'var(--color-accent-soft)', padding: 10, borderRadius: R.control, color: 'var(--color-accent)' }}>
                <Sparkles size={20} />
              </div>
              <div>
                <p style={{ fontSize: 12, color: T.mute }}>Plano Pro</p>
                <p style={{ fontSize: 22, fontWeight: W.title, fontFamily: T.display, color: T.text, marginTop: 2 }}>
                  {contadores.pro}
                </p>
              </div>
            </Card>
          </div>

          {/* Barra de Filtros */}
          <Card style={{ padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Campo de Busca */}
              <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
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

              {/* Filtro por Plano */}
              <div style={{ width: 170 }}>
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
              <div style={{ width: 170 }}>
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

              {temFiltroAtivo && (
                <Button variant="ghost" onClick={limparFiltros} style={{ fontSize: 13, padding: '8px 12px' }}>
                  Limpar filtros
                </Button>
              )}
            </div>
          </Card>

          {/* Tabela de Gestores */}
          <div style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-soft)', background: 'transparent' }}>
                    <th style={{ padding: '14px 20px', color: T.mute, fontSize: 12, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Gestor
                    </th>
                    <th style={{ padding: '14px 20px', color: T.mute, fontSize: 12, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Data de Cadastro
                    </th>
                    <th style={{ padding: '14px 20px', color: T.mute, fontSize: 12, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Prédios
                    </th>
                    <th style={{ padding: '14px 20px', color: T.mute, fontSize: 12, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Plano Atual
                    </th>
                    <th style={{ padding: '14px 20px', color: T.mute, fontSize: 12, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Status
                    </th>
                    <th style={{ padding: '14px 20px', color: T.mute, fontSize: 12, fontWeight: W.strong, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading &&
                    [1, 2, 3, 4, 5].map((i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td style={{ padding: '14px 20px' }}><Skeleton style={{ height: 36, width: 220 }} /></td>
                        <td style={{ padding: '14px 20px' }}><Skeleton style={{ height: 20, width: 90 }} /></td>
                        <td style={{ padding: '14px 20px' }}><Skeleton style={{ height: 20, width: 70 }} /></td>
                        <td style={{ padding: '14px 20px' }}><Skeleton style={{ height: 24, width: 100 }} /></td>
                        <td style={{ padding: '14px 20px' }}><Skeleton style={{ height: 24, width: 80 }} /></td>
                        <td style={{ padding: '14px 20px', textAlign: 'right' }}><Skeleton style={{ height: 30, width: 90, marginLeft: 'auto' }} /></td>
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
                          <td style={{ padding: '14px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <Avatar user={gestor} size={36} />
                              <div style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', color: T.text, fontSize: 14, fontWeight: W.title }}>
                                  {gestor.name}
                                </span>
                                <span style={{ display: 'block', color: T.mute, fontSize: 12 }}>
                                  {gestor.email}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Coluna 2: Cadastro */}
                          <td style={{ padding: '14px 20px', color: T.mute, fontSize: 13 }}>
                            {dataCurta(gestor.created_at)}
                          </td>

                          {/* Coluna 3: Prédios */}
                          <td style={{ padding: '14px 20px' }}>
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
                              }}
                            >
                              <Building2 size={13} />
                              {qtdPredios} {qtdPredios === 1 ? 'prédio' : 'prédios'}
                            </span>
                          </td>

                          {/* Coluna 4: Plano Atual */}
                          <td style={{ padding: '14px 20px' }}>
                            <PlanoBadge plan={gestor.plan} />
                          </td>

                          {/* Coluna 5: Status */}
                          <td style={{ padding: '14px 20px' }}>
                            <Badge variant={suspenso ? 'danger' : 'success'}>
                              {suspenso ? 'Suspenso' : 'Ativo'}
                            </Badge>
                          </td>

                          {/* Coluna 6: Ações */}
                          <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                            <Button
                              variant="secondary"
                              style={{ padding: '6px 12px', fontSize: 12 }}
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
          </div>

          <p style={{ color: T.faint, fontSize: 12, marginTop: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={13} aria-hidden="true" />
            Toda concessão, suspensão ou congelamento entra na trilha de auditoria com autor, data e motivo.
          </p>

          {/* Modal de Detalhes do Gestor (cobre 2/3 da tela) */}
          <GestorDetalhesModal
            key={gestorSelecionado?.id || 'none'}
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
