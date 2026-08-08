'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { LogOut, ArrowLeft, Building2 } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Logo } from '@/app/components/Logo';
import { M, MPage, MTopBar, MRound, MCard, MField, MButton, MButtonGhost, MSectionHead } from '@/app/components/mobile/kit';
import { BottomNav } from '@/app/components/BottomNav';
import { Button, Input, Card, Modal } from '@/app/components/ui';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';
import { useUpdateMe, useChangePassword, useDeleteMe, useMyBuildings, useLeaveBuilding, useRequestAccess, useBuildingByKey } from '@/app/hooks/useApi';
import { formatShareKey, normalizeShareKey, isCompleteShareKey } from '@/app/lib/shareKey';

const profileSchema = yup.object({
  name: yup.string().min(2).required('Obrigatório'),
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
});

const passwordSchema = yup.object({
  current_password: yup.string().required('Obrigatório'),
  new_password: yup.string().min(8, 'Mínimo 8 caracteres').required('Obrigatório'),
});

const ROLE_LABELS = { ADMIN: 'Administrador', INSPECTOR: 'Inspetor', VIEWER: 'Visualizador' };

// Tokens do desktop: chapa escura, folha dourada e filete fino no lugar de cartões
const DS = {
  page: '#0A0A11',
  panel: 'linear-gradient(158deg, #17171F 0%, #0E0E15 62%, #101018 100%)',
  hairline: 'rgba(255,255,255,0.08)',
  gold: '#F5C518',
  goldEdge: 'rgba(245,197,24,0.28)',
  dim: 'rgba(255,255,255,0.42)',
  faint: 'rgba(255,255,255,0.22)',
  danger: '#F87171',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

/**
 * Credencial de acesso: o artefato que representa quem você é dentro do prédio.
 * O brilho acompanha o cursor, como a luz correndo no relevo de um crachá.
 */
function Credential({ user, building }) {
  const cardRef = useRef(null);

  function handleMove(e) {
    const el = cardRef.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    el.style.setProperty('--sheen', '1');
  }

  const rows = [
    ['Função', ROLE_LABELS[user?.role] || user?.role || '—'],
    ['Prédio', building?.name ?? (user?.role === 'ADMIN' ? 'Todos os prédios' : 'Sem vínculo')],
  ];

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMove}
      onMouseLeave={() => cardRef.current?.style.setProperty('--sheen', '0')}
      style={{
        position: 'sticky',
        top: 108,
        background: DS.panel,
        border: `1px solid ${DS.goldEdge}`,
        borderRadius: 22,
        padding: '22px 24px 24px',
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
      }}
    >
      {/* brilho que segue o cursor */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(340px circle at var(--mx, 50%) var(--my, 0%), rgba(245,197,24,0.16), transparent 62%)',
        opacity: 'var(--sheen, 0)', transition: 'opacity 0.35s ease',
      }} />

      {/* furo do cordão */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <div style={{ width: 66, height: 7, borderRadius: 99, background: '#05050A', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.06)' }} />
      </div>

      <div style={{ position: 'relative' }}>
        <p style={{ fontFamily: DS.mono, fontSize: 10, letterSpacing: '0.22em', color: DS.faint, textTransform: 'uppercase' }}>
          Credencial
        </p>

        <p style={{
          fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 900, fontSize: 26, lineHeight: 1.12, marginTop: 10,
          background: 'linear-gradient(96deg, #F5C518 0%, #FFF3C4 38%, #E0A800 72%, #F5C518 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>
          {user?.name ?? ''}
        </p>

        <p style={{ fontFamily: DS.mono, fontSize: 11, color: DS.dim, marginTop: 8, wordBreak: 'break-all' }}>
          {user?.email}
        </p>

        <div style={{ height: 1, background: DS.hairline, margin: '20px 0 4px' }} />

        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '12px 0', borderBottom: `1px solid ${DS.hairline}` }}>
            <span style={{ fontFamily: DS.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: DS.faint }}>{label}</span>
            <span style={{ color: 'rgba(255,255,255,0.86)', fontSize: 13, textAlign: 'right' }}>{value}</span>
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
          <Logo size={13} style={{ color: 'rgba(255,255,255,0.55)', WebkitTextStroke: '0px' }} />
          <span style={{ fontFamily: DS.mono, fontSize: 10, color: DS.faint }}>
            Nº {(user?.id ?? '').slice(0, 8).toUpperCase() || '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Linha da folha de dados: rótulo à esquerda, controles à direita, filete entre elas. */
function SpecRow({ label, hint, children }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 32, padding: '28px 0', borderTop: `1px solid ${DS.hairline}` }}>
      <div>
        <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.62)' }}>{label}</h2>
        {hint && <p style={{ color: DS.faint, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{hint}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

export default function PerfilPage() {
  const { user, setUser, logout } = useAuthStore();
  const { show: toast } = useToastStore();
  const router = useRouter();
  const [deleteModal, setDeleteModal] = useState(false);

  const updateMe = useUpdateMe();
  const changePassword = useChangePassword();
  const deleteMe = useDeleteMe();
  const leaveBuilding = useLeaveBuilding();
  const requestAccess = useRequestAccess();

  const { data: myBuildings = [], isLoading: buildingsLoading } = useMyBuildings();
  const hasBuilding = myBuildings.length > 0;
  const myBuilding = myBuildings[0];

  const [newBuildingKey, setNewBuildingKey] = useState('');
  const [searchBuildingKey, setSearchBuildingKey] = useState('');
  const [accessRequested, setAccessRequested] = useState(false);
  const { data: searchedBuilding, isLoading: searchLoading, error: searchError } = useBuildingByKey(searchBuildingKey);

  async function handleLeave() {
    if (!confirm('Tem certeza que deseja sair deste prédio?')) return;
    try {
      await leaveBuilding.mutateAsync(myBuilding.id);
      setNewBuildingKey('');
      setSearchBuildingKey('');
      setAccessRequested(false);
      toast('Você saiu do prédio', 'info');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao sair do prédio', 'error');
    }
  }

  function handleSearchBuilding() {
    const key = normalizeShareKey(newBuildingKey);
    if (!isCompleteShareKey(key)) {
      toast('Chave inválida. Ela tem 12 caracteres.', 'error');
      return;
    }
    setSearchBuildingKey(key);
    setAccessRequested(false);
  }

  async function handleRequestAccess() {
    try {
      await requestAccess.mutateAsync(searchBuildingKey);
      setAccessRequested(true);
      toast('Solicitação enviada! Aguarde a aprovação.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao solicitar acesso', 'error');
    }
  }

  const profileForm = useForm({
    resolver: yupResolver(profileSchema),
    defaultValues: { name: user?.name || '', email: user?.email || '' },
  });

  const passwordForm = useForm({ resolver: yupResolver(passwordSchema) });

  async function onProfileSubmit(data) {
    try {
      const updated = await updateMe.mutateAsync(data);
      setUser(updated);
      toast('Perfil atualizado!', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao atualizar', 'error');
    }
  }

  async function onPasswordSubmit(data) {
    try {
      await changePassword.mutateAsync(data);
      passwordForm.reset();
      toast('Senha alterada com sucesso!', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Senha atual incorreta', 'error');
    }
  }

  async function handleDelete() {
    try {
      await deleteMe.mutateAsync();
      logout();
      router.replace('/login');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao excluir conta', 'error');
    }
  }

  // `bare` remove o cartão: no desktop a seção vive dentro da folha de dados
  function BuildingSection({ bare = false }) {
    if (user?.role === 'ADMIN') return null;

    const content = (
      <>
        {buildingsLoading ? (
          <div style={{ height: 48, background: 'rgba(255,255,255,0.05)', borderRadius: 12 }} />
        ) : hasBuilding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Building2 size={18} color="#F5C518" />
              <div>
                <p style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: 14 }}>{myBuilding.name}</p>
                {myBuilding.description && <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 }}>{myBuilding.description}</p>}
              </div>
            </div>
            <button onClick={handleLeave} disabled={leaveBuilding.isPending}
              className="w-full text-sm text-red-400 border border-red-900/40 bg-red-900/10 rounded-2xl py-2.5 hover:bg-red-900/20 transition-colors disabled:opacity-50">
              {leaveBuilding.isPending ? 'Saindo...' : 'Sair deste prédio'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Você não está vinculado a nenhum prédio.</p>
            {!accessRequested ? (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '10px 14px', color: 'rgba(255,255,255,0.85)', fontSize: 13, outline: 'none', fontFamily: 'monospace', letterSpacing: '0.08em' }}
                    placeholder="ABCD-EFGH-JKMN"
                    maxLength={14}
                    value={newBuildingKey}
                    onChange={e => setNewBuildingKey(formatShareKey(e.target.value))}
                    onKeyDown={e => e.key === 'Enter' && handleSearchBuilding()}
                  />
                  <Button variant="secondary" onClick={handleSearchBuilding}>Buscar</Button>
                </div>
                {searchLoading && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Buscando...</p>}
                {searchError && <p style={{ color: '#f87171', fontSize: 13 }}>Chave inválida ou prédio não encontrado</p>}
                {searchedBuilding && (
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 14 }}>{searchedBuilding.name}</p>
                    <Button onClick={handleRequestAccess} loading={requestAccess.isPending} style={{ fontSize: 12, padding: '6px 14px' }}>Conectar-se</Button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
                <p style={{ color: '#4ade80', fontWeight: 600, fontSize: 14 }}>Solicitação enviada!</p>
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 4 }}>Aguarde a aprovação do administrador.</p>
              </div>
            )}
          </div>
        )}
      </>
    );

    if (bare) return content;

    return (
      <Card>
        <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-4">Prédio vinculado</h2>
        {content}
      </Card>
    );
  }

  return (
    <RouteGuard>
      {/* ── DESKTOP ── */}
      <div className="hidden lg:block min-h-screen" style={{ background: DS.page }}>
        <header style={{ position: 'sticky', top: 0, height: 60, background: 'rgba(10,10,17,0.82)', backdropFilter: 'blur(24px)', borderBottom: `1px solid ${DS.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', zIndex: 10 }}>
          <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.9)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}>
            <ArrowLeft size={18} /> Voltar
          </button>
          <Logo size={16} />
          <button onClick={() => { logout(); router.replace('/login'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}
            onMouseEnter={e => e.currentTarget.style.color = DS.danger}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}>
            <LogOut size={16} /> Sair
          </button>
        </header>

        <div style={{ maxWidth: 1060, margin: '0 auto', padding: '48px 32px 80px', display: 'grid', gridTemplateColumns: '320px 1fr', gap: 48, alignItems: 'start' }}>
          <Credential user={user} building={myBuilding} />

          <div>
            <h1 style={{ fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 900, fontSize: 30, color: 'rgba(255,255,255,0.94)', letterSpacing: '-0.01em' }}>
              Sua conta
            </h1>
            <p style={{ color: DS.dim, fontSize: 14, marginTop: 6, maxWidth: 460 }}>
              Estes dados aparecem nos relatórios que você assina e definem seu acesso ao prédio.
            </p>

            <div style={{ marginTop: 36 }}>
              <SpecRow label="Identificação" hint="Nome e e-mail que assinam suas vistorias">
                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
                  <Input label="Nome" error={profileForm.formState.errors.name?.message} {...profileForm.register('name')} />
                  <Input label="E-mail" type="email" error={profileForm.formState.errors.email?.message} {...profileForm.register('email')} />
                  <Button type="submit" loading={updateMe.isPending} style={{ alignSelf: 'flex-start' }}>Salvar alterações</Button>
                </form>
              </SpecRow>

              <SpecRow label="Senha" hint="Mínimo de 8 caracteres">
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
                  <Input label="Senha atual" type="password" error={passwordForm.formState.errors.current_password?.message} {...passwordForm.register('current_password')} />
                  <Input label="Nova senha" type="password" error={passwordForm.formState.errors.new_password?.message} {...passwordForm.register('new_password')} />
                  <Button type="submit" loading={changePassword.isPending} style={{ alignSelf: 'flex-start' }}>Alterar senha</Button>
                </form>
              </SpecRow>

              {user?.role !== 'ADMIN' && (
                <SpecRow label="Prédio" hint="O prédio que você vistoria">
                  <div style={{ maxWidth: 460 }}>{BuildingSection({ bare: true })}</div>
                </SpecRow>
              )}

              <SpecRow label="Excluir conta" hint="Não dá para desfazer">
                <div style={{ maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
                  <p style={{ color: DS.dim, fontSize: 13, lineHeight: 1.6 }}>
                    Seu acesso é encerrado na hora. As vistorias que você registrou continuam no histórico do prédio, sem o seu nome.
                  </p>
                  <Button variant="ghost" onClick={() => setDeleteModal(true)}
                    style={{ color: DS.danger, padding: '4px 0' }}>
                    Excluir conta
                  </Button>
                </div>
              </SpecRow>
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE ── */}
      <div className="lg:hidden">
        <MPage>
          <MTopBar
            title="Perfil"
            avatar={
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: M.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: M.display, fontWeight: 700, fontSize: 18, color: '#000' }}>
                {user?.name?.[0]?.toUpperCase()}
              </div>
            }
            actions={
              <MRound label="Sair" onClick={() => { logout(); router.replace('/login'); }}>
                <LogOut size={17} />
              </MRound>
            }
          />

          <MCard style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ fontFamily: M.display, fontWeight: 700, fontSize: 18, color: M.text }}>{user?.name}</p>
            <p style={{ color: M.mute, fontSize: 13 }}>{user?.email}</p>
            <span style={{ alignSelf: 'flex-start', marginTop: 10, background: M.accentSoft, color: M.accent, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 10 }}>
              {ROLE_LABELS[user?.role] || user?.role}
            </span>
          </MCard>

          <MSectionHead title="Identificação" />
          <MCard>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <MField label="Nome" error={profileForm.formState.errors.name?.message} {...profileForm.register('name')} />
              <MField label="E-mail" type="email" error={profileForm.formState.errors.email?.message} {...profileForm.register('email')} />
              <MButton type="submit" loading={updateMe.isPending} style={{ width: '100%' }}>Salvar alterações</MButton>
            </form>
          </MCard>

          <MSectionHead title="Senha" />
          <MCard>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <MField label="Senha atual" type="password" error={passwordForm.formState.errors.current_password?.message} {...passwordForm.register('current_password')} />
              <MField label="Nova senha" type="password" error={passwordForm.formState.errors.new_password?.message} {...passwordForm.register('new_password')} />
              <MButton type="submit" loading={changePassword.isPending} style={{ width: '100%' }}>Alterar senha</MButton>
            </form>
          </MCard>

          {user?.role !== 'ADMIN' && (
            <>
              <MSectionHead title="Prédio" />
              <MCard>{BuildingSection({ bare: true })}</MCard>
            </>
          )}

          <MSectionHead title="Excluir conta" />
          <MCard>
            <p style={{ color: M.mute, fontSize: 13, lineHeight: 1.6 }}>
              Seu acesso é encerrado na hora. As vistorias que você registrou continuam no histórico do prédio, sem o seu nome.
            </p>
            <MButtonGhost tone="danger" onClick={() => setDeleteModal(true)} style={{ width: '100%', marginTop: 14 }}>
              Excluir conta
            </MButtonGhost>
          </MCard>

          <BottomNav />
        </MPage>
      </div>

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Excluir conta">
        <p className="text-white/40 text-sm mb-6">
          Tem certeza? Esta ação é <strong className="text-white/80">irreversível</strong>. Seu nome e e-mail serão anonimizados.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteModal(false)}>Cancelar</Button>
          <Button variant="danger" className="flex-1" loading={deleteMe.isPending} onClick={handleDelete}>Confirmar</Button>
        </div>
      </Modal>
    </RouteGuard>
  );
}
