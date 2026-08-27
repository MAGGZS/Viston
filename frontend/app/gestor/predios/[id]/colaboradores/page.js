'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Users, UserMinus, AlertTriangle, Check, X } from 'lucide-react';
import { Avatar } from '@/app/components/Avatar';
import { GestorShell } from '@/app/components/GestorShell';
import { Button, Modal, Select } from '@/app/components/ui';
import {
  useBuildingMembers,
  useRemoveMember,
  useUpdateMemberRole,
  useAccessRequests,
  useReviewAccessRequest,
  useAddBuildingManager,
  useRemoveBuildingManager,
} from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

// Gestor não está aqui: é outro tipo de conta, e entra pelo e-mail (ver
// AddManagerForm). Os quatro papéis de vínculo trocam livremente entre si.
const ROLE_OPTIONS = [
  { value: 'VIEWER', label: 'Visualizador' },
  { value: 'INSPECTOR', label: 'Inspetor' },
  { value: 'MODERADOR', label: 'Moderador' },
  { value: 'RESPONSAVEL', label: 'Responsável' },
];

const ROLE_TOAST = {
  INSPECTOR: 'Agora é inspetor',
  VIEWER: 'Agora é visualizador',
  MODERADOR: 'Agora é moderador — recebe e fecha os chamados',
  RESPONSAVEL: 'Agora é responsável — atende os chamados encaminhados',
};

/** Um bloco da tela: título, uma linha de explicação e o miolo. */
function Section({ title, hint, children, className = '' }) {
  return (
    <section className={className} style={{ background: T.card, borderRadius: R.card, padding: 22 }}>
      <h2 style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text }}>{title}</h2>
      {hint && <p style={{ color: T.mute, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{hint}</p>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  );
}

/**
 * Linha de colaborador — usuário vinculado ao prédio.
 *
 * O papel é decisão do gestor: quem se vincula entra como visualizador e sobe
 * daqui. Virar gestor não passa por esta linha, porque gestor é outro tipo de
 * conta.
 */
function MemberRow({ member, buildingId, onRemove, className = '' }) {
  const updateRole = useUpdateMemberRole();
  const { show: toast } = useToastStore();

  async function handleRoleChange(role) {
    try {
      await updateRole.mutateAsync({ buildingId, userId: member.user_id, role });
      toast(ROLE_TOAST[role], 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao alterar o papel', 'error', e);
    }
  }

  return (
    <div className={`flex items-center gap-3 bg-chip rounded-control px-4 py-3 ${className}`}>
      <Avatar user={member.user} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-ink text-sm font-medium truncate">{member.user?.name}</p>
        <p className="text-mute text-xs truncate">{member.user?.email}</p>
      </div>
      {/* `raised` sobe o fundo um nível, porque a linha inteira já é chip */}
      <Select
        raised
        wrapperClassName="flex-shrink-0"
        wrapperStyle={{ width: 164, flexBasis: 164 }}
        style={{ padding: '7px 30px 7px 12px', fontSize: 12 }}
        aria-label={`Papel de ${member.user?.name} neste prédio`}
        options={ROLE_OPTIONS}
        value={member.role}
        disabled={updateRole.isPending}
        onChange={(e) => handleRoleChange(e.target.value)}
      />
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.faint, display: 'flex', padding: 4, borderRadius: 8, flexShrink: 0 }}
        onMouseEnter={e => e.currentTarget.style.color = T.danger}
        onMouseLeave={e => e.currentTarget.style.color = T.faint}
        title="Remover vínculo">
        <UserMinus size={15} />
      </button>
    </div>
  );
}

/**
 * Linha de gestor. Conta própria, não um vínculo com papel — por isso não tem
 * seletor: ou a pessoa administra o prédio, ou não está aqui.
 *
 * `sole` marca o último gestor: tirá-lo deixaria o prédio sem ninguém que possa
 * administrá-lo, então o controle fica travado (a API também recusa, com 409).
 */
function ManagerRow({ link, buildingId, sole, className = '' }) {
  const removeManager = useRemoveBuildingManager();
  const { show: toast } = useToastStore();

  async function handleRemove() {
    try {
      await removeManager.mutateAsync({ buildingId, managerId: link.manager_id });
      toast('Gestor removido do prédio', 'info');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao remover gestor', 'error', e);
    }
  }

  return (
    <div className={`flex items-center gap-3 rounded-control px-4 py-3 ${className}`}
      style={{ background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.15)' }}>
      <Avatar user={link.manager} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-ink text-sm font-semibold truncate">{link.manager?.name}</p>
        <p className="text-mute text-xs truncate">{link.manager?.email}</p>
      </div>
      <span className="text-xs font-semibold px-3 py-1.5 rounded-pill text-accent-ink flex-shrink-0"
        style={{ background: 'rgba(245,197,24,0.13)' }}>
        Gestor
      </span>
      <button
        onClick={handleRemove}
        disabled={sole || removeManager.isPending}
        style={{ background: 'none', border: 'none', cursor: sole ? 'not-allowed' : 'pointer', color: T.faint, display: 'flex', padding: 4, borderRadius: 8, flexShrink: 0, opacity: sole ? 0.4 : 1 }}
        onMouseEnter={e => { if (!sole) e.currentTarget.style.color = T.danger; }}
        onMouseLeave={e => e.currentTarget.style.color = T.faint}
        title={sole ? 'Este é o único gestor do prédio. Adicione outro antes.' : 'Tirar da gestão'}>
        <UserMinus size={15} />
      </button>
    </div>
  );
}

/**
 * Adiciona outro gestor pelo e-mail da conta de gestor dele.
 *
 * É o caminho de dividir e de transferir a gestão: quem quer sair adiciona o
 * substituto antes, porque a saída do último é recusada. O e-mail precisa ser
 * de uma conta de gestor — conta de usuário comum não administra prédio.
 */
function AddManagerForm({ buildingId }) {
  const [email, setEmail] = useState('');
  const addManager = useAddBuildingManager();
  const { show: toast } = useToastStore();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await addManager.mutateAsync({ buildingId, email: email.trim() });
      setEmail('');
      toast('Gestor adicionado ao prédio', 'success');
    } catch (err) {
      toast(err?.response?.data?.error?.message || 'Erro ao adicionar gestor', 'error', err);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="E-mail da conta de gestor"
        aria-label="E-mail do gestor a adicionar"
        className="flex-1 bg-chip rounded-control px-4 py-2.5 text-sm text-ink outline-none"
        style={{ border: '1px solid transparent' }}
      />
      <Button type="submit" loading={addManager.isPending} style={{ flexShrink: 0 }}>
        Adicionar
      </Button>
    </form>
  );
}

/** Uma solicitação pendente: quem pediu, quando, e as duas saídas. */
function RequestRow({ request, buildingId, className = '' }) {
  const review = useReviewAccessRequest();
  const { show: toast } = useToastStore();

  async function handle(status) {
    try {
      await review.mutateAsync({ buildingId, requestId: request.id, status });
      toast(
        status === 'APPROVED' ? 'Acesso aprovado! Entrou como visualizador.' : 'Solicitação rejeitada',
        status === 'APPROVED' ? 'success' : 'info'
      );
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao revisar solicitação', 'error', e);
    }
  }

  return (
    <div className={`flex items-center gap-3 bg-chip rounded-control px-4 py-3 ${className}`}>
      <Avatar user={request.user} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-ink text-sm font-medium truncate">{request.user?.name}</p>
        <p className="text-mute text-xs truncate">{request.user?.email}</p>
      </div>
      <span className="text-faint text-xs whitespace-nowrap">
        {format(new Date(request.requested_at), 'dd/MM/yyyy', { locale: ptBR })}
      </span>
      <button
        onClick={() => handle('APPROVED')}
        disabled={review.isPending}
        title="Aprovar"
        aria-label={`Aprovar ${request.user?.name}`}
        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-pill bg-accent text-onaccent transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-50 flex-shrink-0"
      >
        <Check size={13} /> Aprovar
      </button>
      <button
        onClick={() => handle('REJECTED')}
        disabled={review.isPending}
        title="Rejeitar"
        aria-label={`Rejeitar ${request.user?.name}`}
        className="flex items-center justify-center w-8 h-8 rounded-pill bg-card text-danger transition-all duration-150 hover:scale-110 active:scale-95 disabled:opacity-50 flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * A aba de colaboradores.
 *
 * Era uma caixa de 560px aberta pelo painel, e não cabia mais: quem administra o
 * prédio passa mais tempo aqui do que em qualquer outra tela — é onde se define
 * quem vistoria, quem modera e quem atende. Virou aba, com a lista inteira à
 * vista.
 *
 * O botão de solicitações veio junto, do mesmo jeito que era no painel: quem
 * pediu vínculo entra por esta tela, e o pedido pendente vira colaborador aqui
 * ao lado. Separá-los obrigava a atravessar o produto para terminar um trabalho
 * só.
 */
export default function GestorColaboradoresPage() {
  const { id } = useParams();
  const { show: toast } = useToastStore();

  const [requestsModal, setRequestsModal] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // membro a remover

  const { data: membersData, isLoading: membersLoading } = useBuildingMembers(id);
  const { data: requests = [], isLoading: requestsLoading } = useAccessRequests(id);
  const removeMember = useRemoveMember();

  const managers = membersData?.managers ?? [];
  const members = membersData?.members ?? [];

  return (
    <GestorShell
      buildingId={id}
      title="Colaboradores"
      subtitle="Quem está neste prédio, e o que cada um pode fazer nele"
      actions={
        <button onClick={() => setRequestsModal(true)}
          className="relative flex items-center gap-2 px-4 py-2 bg-chip rounded-control text-mute text-sm hover:text-ink transition-colors flex-shrink-0">
          <Users size={15} /> Solicitações
          {requests.length > 0 && (
            <span className="anim-pop-in flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-accent text-onaccent text-xs font-semibold">
              {requests.length}
            </span>
          )}
        </button>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
        <div style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Section
            className="anim-fade-up"
            title="Gestão"
            hint="Gestor é uma conta própria: informe o e-mail de quem já tem cadastro de gestor. Um prédio pode ter mais de um — o que ele não pode é ficar sem nenhum."
          >
            {membersLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2].map(i => <div key={i} className="h-14 bg-chip rounded-control animate-pulse" />)}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {managers.map((link, idx) => (
                  <ManagerRow
                    key={link.id}
                    link={link}
                    buildingId={id}
                    sole={managers.length === 1}
                    className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
                  />
                ))}
              </div>
            )}
            <AddManagerForm buildingId={id} />
          </Section>

          <Section
            className="anim-fade-up anim-d2"
            title="Vínculos do prédio"
            hint="Quem vistoria, acompanha, modera e atende. O papel muda no seletor de cada linha."
          >
            {membersLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-chip rounded-control animate-pulse" />)}
              </div>
            ) : members.length === 0 ? (
              <p className="text-mute text-sm text-center py-6">Nenhum usuário vinculado a este prédio</p>
            ) : (
              <div className="flex flex-col gap-2">
                {members.map((m, idx) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    buildingId={id}
                    className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
                    onRemove={() => setConfirmRemove(m)}
                  />
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      <Modal open={requestsModal} onClose={() => setRequestsModal(false)} title="Solicitações de acesso" maxWidth={560}>
        {requestsLoading ? (
          <div className="flex flex-col gap-3">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-card rounded-control animate-pulse" />)}
          </div>
        ) : requests.length === 0 ? (
          <p className="text-mute text-sm text-center py-6">Nenhuma solicitação pendente</p>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((r, idx) => (
              <RequestRow
                key={r.id}
                request={r}
                buildingId={id}
                className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
              />
            ))}
          </div>
        )}
        <p className="text-faint text-xs mt-4 leading-relaxed">
          Quem é aprovado entra como visualizador. O papel dele muda aqui mesmo,
          nesta tela — inclusive para moderador, que recebe e fecha os chamados,
          ou responsável, que os atende.
        </p>
      </Modal>

      {/* Confirmação de desvinculo */}
      <Modal open={!!confirmRemove} onClose={() => setConfirmRemove(null)} title="Remover colaborador">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} color={T.danger} style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ color: T.text, fontSize: 14, lineHeight: 1.6 }}>
              Tem certeza que deseja remover o vínculo de <span style={{ fontWeight: 600 }}>{confirmRemove?.user?.name}</span> com este prédio? O usuário perderá o acesso imediatamente.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setConfirmRemove(null)}>Cancelar</Button>
            <Button variant="danger" style={{ flex: 1 }} loading={removeMember.isPending}
              onClick={async () => {
                try {
                  await removeMember.mutateAsync({ buildingId: id, userId: confirmRemove.user_id });
                  toast(`${confirmRemove.user?.name} removido`, 'info');
                  setConfirmRemove(null);
                } catch (e) {
                  toast(e?.response?.data?.error?.message || 'Erro ao remover', 'error', e);
                }
              }}>
              Remover
            </Button>
          </div>
        </div>
      </Modal>
    </GestorShell>
  );
}
