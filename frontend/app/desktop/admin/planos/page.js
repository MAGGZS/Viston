'use client';
import { useState } from 'react';
import { Ban, CheckCircle2, Search, Snowflake, Undo2 } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Avatar } from '@/app/components/Avatar';
import { Badge, Button, Card, Input, Modal, Select, Skeleton } from '@/app/components/ui';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { useToastStore } from '@/app/store/toast';
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

/**
 * O painel de planos do suporte.
 *
 * As rotas existem desde que o gating entrou, e até agora só eram alcançáveis
 * por chamada direta à API — o que quer dizer que, na prática, resolver um caso
 * exigia alguém com o token na mão e a rota na memória. Esta tela é a mesma
 * coisa com nome e botão.
 *
 * Uma conta por vez, escolhida na lista da esquerda. Não existe ação em massa
 * de propósito: conceder plano e suspender conta são decisões sobre uma pessoa,
 * e um botão que as aplica a vinte de uma vez é um botão que um dia vai ser
 * clicado sem querer.
 */

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
  return valor ? new Date(valor).toLocaleDateString('pt-BR') : null;
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

function ListaDeGestores({ gestores, carregando, selecionado, onSelect, busca, onBusca }) {
  return (
    <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 260 }}>
      <div style={{ position: 'relative' }}>
        <Search
          size={15}
          color={T.faint}
          aria-hidden="true"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
        />
        <input
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar gestor"
          style={{
            width: '100%',
            background: T.chip,
            borderRadius: R.pill,
            padding: '9px 12px 9px 34px',
            color: T.text,
            fontSize: 14,
            outline: 'none',
          }}
        />
      </div>

      {carregando && [1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 46 }} />)}

      {!carregando && gestores.length === 0 && (
        <p style={{ color: T.mute, fontSize: 13, padding: '8px 4px' }}>Nenhum gestor encontrado.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 520, overflowY: 'auto' }}>
        {gestores.map((gestor) => (
          <button
            key={gestor.id}
            type="button"
            onClick={() => onSelect(gestor)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 10px',
              borderRadius: R.control,
              background: selecionado?.id === gestor.id ? T.accentSoft : 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Avatar user={gestor} size={28} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', color: T.text, fontSize: 14, fontWeight: W.title, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {gestor.name}
              </span>
              <span style={{ display: 'block', color: T.mute, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {gestor.email}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function ConcederModal({ open, gestor, onClose }) {
  const { show: toast } = useToastStore();
  const conceder = useGrantPlan();

  const [plan, setPlan] = useState('ESSENCIAL');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('30');

  async function enviar() {
    if (reason.trim().length < 3) {
      toast('Escreva o motivo da concessão', 'error');
      return;
    }

    try {
      await conceder.mutateAsync({
        managerId: gestor.id,
        plan,
        reason: reason.trim(),
        // Campo vazio é concessão sem prazo, e o backend trata a ausência como
        // decisão explícita — por isso `undefined`, e não zero.
        ...(days.trim() ? { days: Number(days) } : {}),
      });
      toast(`${nomeDoPlano(plan)} concedido a ${gestor.name}`, 'success');
      setReason('');
      onClose();
    } catch (err) {
      toast(mensagemDoErro(err, 'Não foi possível conceder'), 'error');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Conceder plano — ${gestor?.name ?? ''}`} maxWidth={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Select
          label="Plano"
          value={plan}
          onChange={setPlan}
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
          <Button variant="secondary" style={{ flex: 1 }} onClick={onClose}>
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

function PainelDaConta({ gestor }) {
  const { show: toast } = useToastStore();
  const { data, isLoading } = useManagerPlan(gestor?.id);
  const { data: todosOsPredios = [] } = useBuildings();
  const revogar = useRevokeGrant();
  const suspender = useSetSuspension();
  const congelar = useSetBuildingFreeze();

  const [concedendo, setConcedendo] = useState(false);
  const [confirmacao, setConfirmacao] = useState(null);

  if (!gestor) {
    return (
      <Card style={{ padding: 28 }}>
        <p style={{ color: T.mute, fontSize: 14 }}>
          Escolha um gestor na lista para ver o plano, o consumo e o histórico de concessões.
        </p>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <Card style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Skeleton style={{ height: 22, width: 200 }} />
        <Skeleton style={{ height: 14, width: 280 }} />
        <Skeleton style={{ height: 80 }} />
      </Card>
    );
  }

  const suspenso = !!gestor.suspended_at;
  const predios = todosOsPredios.filter((p) => p.owner_manager_id === gestor.id);

  async function alternarSuspensao() {
    try {
      await suspender.mutateAsync({ managerId: gestor.id, suspended: !suspenso });
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 0 }}>
      <Card style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontFamily: T.display, fontSize: 20, fontWeight: W.title, color: T.text }}>
              {gestor.name}
            </h2>
            <p style={{ color: T.mute, fontSize: 13, marginTop: 2 }}>{gestor.email}</p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge variant={data.plan.source === 'PADRAO' ? 'default' : 'accent'}>
              {data.plan.name}
            </Badge>
            {suspenso && <Badge variant="danger">Suspensa</Badge>}
          </div>
        </div>

        <p style={{ color: T.mute, fontSize: 13 }}>
          De onde vem: {DE_ONDE_VEM[data.plan.source]} · {data.plan.buildings_allowed}{' '}
          {data.plan.buildings_allowed === 1 ? 'prédio' : 'prédios'} no teto
          {data.plan.extra_buildings > 0 ? ` (${data.plan.extra_buildings} extras)` : ''}
        </p>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[
            { rotulo: 'Prédios', valor: `${data.usage.buildings} de ${data.plan.buildings_allowed}` },
            { rotulo: `E-mails em ${data.usage.period}`, valor: data.usage.emails_this_month },
            { rotulo: 'Fotos', valor: emGigas(data.usage.storage_bytes) },
          ].map(({ rotulo, valor }) => (
            <div key={rotulo} style={{ background: T.chip, borderRadius: R.control, padding: '12px 14px' }}>
              <p style={{ color: T.mute, fontSize: 12 }}>{rotulo}</p>
              <p style={{ color: T.text, fontSize: 18, fontFamily: T.display, fontWeight: W.title, marginTop: 2 }}>
                {valor}
              </p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={() => setConcedendo(true)}>Conceder plano</Button>
          <Button
            variant={suspenso ? 'secondary' : 'danger'}
            onClick={() =>
              setConfirmacao({
                titulo: suspenso ? 'Liberar a conta?' : 'Suspender a conta?',
                mensagem: suspenso
                  ? `${gestor.name} volta a entrar normalmente.`
                  : `${gestor.name} deixa de entrar e de renovar a sessão. Os prédios continuam existindo.`,
                confirmar: suspenso ? 'Liberar' : 'Suspender',
                acao: alternarSuspensao,
              })
            }
          >
            {suspenso ? <Undo2 size={15} style={{ marginRight: 8 }} /> : <Ban size={15} style={{ marginRight: 8 }} />}
            {suspenso ? 'Liberar conta' : 'Suspender conta'}
          </Button>
        </div>
      </Card>

      <Card style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text }}>
          Prédios desta conta ({predios.length})
        </h3>

        {predios.length === 0 && (
          <p style={{ color: T.mute, fontSize: 13 }}>Esta conta não paga por nenhum prédio.</p>
        )}

        {predios.map((predio) => (
          <div
            key={predio.id}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
          >
            <div>
              <p style={{ color: T.text, fontSize: 14 }}>{predio.name}</p>
              {predio.frozen_at && (
                <p style={{ color: T.mute, fontSize: 12 }}>
                  Inativo desde {dataCurta(predio.frozen_at)}
                </p>
              )}
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                setConfirmacao({
                  titulo: predio.frozen_at ? 'Reativar o prédio?' : 'Inativar o prédio?',
                  mensagem: predio.frozen_at
                    ? `${predio.name} volta a aceitar vistoria, chamado e gente.`
                    : `${predio.name} para de aceitar trabalho novo. A leitura do histórico continua.`,
                  confirmar: predio.frozen_at ? 'Reativar' : 'Inativar',
                  acao: () => alternarCongelamento(predio),
                })
              }
            >
              {predio.frozen_at ? <Undo2 size={15} style={{ marginRight: 8 }} /> : <Snowflake size={15} style={{ marginRight: 8 }} />}
              {predio.frozen_at ? 'Reativar' : 'Inativar'}
            </Button>
          </div>
        ))}
      </Card>

      <Card style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text }}>
          Concessões ({data.grants.length})
        </h3>

        {data.grants.length === 0 && (
          <p style={{ color: T.mute, fontSize: 13 }}>Nenhuma concessão nesta conta.</p>
        )}

        {data.grants.map((grant) => {
          const estado = estadoDaConcessao(grant);
          const ativa = estado.variant === 'success';

          return (
            <div
              key={grant.id}
              style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: T.text, fontSize: 14, fontWeight: W.title }}>
                    {nomeDoPlano(grant.plan)}
                  </span>
                  <Badge variant={estado.variant}>{estado.label}</Badge>
                </div>
                <p style={{ color: T.mute, fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>
                  {grant.reason} · aberta em {dataCurta(grant.created_at)}
                </p>
              </div>

              {ativa && (
                <Button
                  variant="secondary"
                  loading={revogar.isPending}
                  onClick={async () => {
                    try {
                      await revogar.mutateAsync({ grantId: grant.id, managerId: gestor.id });
                      toast('Concessão revogada', 'info');
                    } catch (err) {
                      toast(mensagemDoErro(err), 'error');
                    }
                  }}
                >
                  Revogar
                </Button>
              )}
            </div>
          );
        })}
      </Card>

      <ConcederModal open={concedendo} gestor={gestor} onClose={() => setConcedendo(false)} />

      <ConfirmModal
        open={!!confirmacao}
        title={confirmacao?.titulo}
        message={confirmacao?.mensagem}
        confirmLabel={confirmacao?.confirmar}
        confirmVariant="danger"
        loading={suspender.isPending || congelar.isPending}
        onConfirm={() => confirmacao?.acao()}
        onCancel={() => setConfirmacao(null)}
      />
    </div>
  );
}

export default function AdminPlanosPage() {
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState(null);
  const { data, isLoading } = useManagers(1);

  const gestores = (data?.managers ?? data?.data ?? []).filter((gestor) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    return (
      gestor.name?.toLowerCase().includes(termo) || gestor.email?.toLowerCase().includes(termo)
    );
  });

  return (
    <RouteGuard roles={['ADMIN']}>
      <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>
        <AdminSidebar />

        <main id={CONTENT_ID} style={{ flex: 1, padding: '28px 24px 64px', minWidth: 0 }}>
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontFamily: T.display, fontSize: 22, fontWeight: W.title, color: T.text }}>
              Planos
            </h1>
            <p style={{ color: T.mute, fontSize: 14, marginTop: 4 }}>
              Conceder plano, suspender conta e inativar prédio — o que o suporte faz quando a
              cobrança não resolve sozinha.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <ListaDeGestores
              gestores={gestores}
              carregando={isLoading}
              selecionado={selecionado}
              onSelect={setSelecionado}
              busca={busca}
              onBusca={setBusca}
            />
            <PainelDaConta gestor={selecionado} />
          </div>

          <p style={{ color: T.faint, fontSize: 12, marginTop: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={13} aria-hidden="true" />
            Toda ação desta tela entra na trilha de auditoria, com autor, data e motivo.
          </p>
        </main>
      </div>
    </RouteGuard>
  );
}
