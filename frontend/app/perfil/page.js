'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { LogOut, ArrowLeft, Building2, ChevronRight, KeyRound, Pencil, Trash2, UserRound } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Avatar } from '@/app/components/Avatar';
import { AvatarEditorModal } from '@/app/components/AvatarEditorModal';
import { JoinBuildingForm } from '@/app/components/JoinBuildingForm';
import { Logo } from '@/app/components/Logo';
import { M, MPage, MRound, MField, MButton } from '@/app/components/mobile/kit';
import { BottomNav } from '@/app/components/BottomNav';
import { Button, Input, Card, Modal } from '@/app/components/ui';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';
import { useUpdateMe, useChangePassword, useDeleteMe, useMyBuildings, useLeaveBuilding } from '@/app/hooks/useApi';
import { T, R, W, HERO_SURFACE } from '@/app/lib/theme';

const profileSchema = yup.object({
  name: yup.string().min(2).required('Obrigatório'),
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
});

const passwordSchema = yup.object({
  current_password: yup.string().required('Obrigatório'),
  new_password: yup.string().min(8, 'Mínimo 8 caracteres').required('Obrigatório'),
  new_password_confirmation: yup
    .string()
    .oneOf([yup.ref('new_password')], 'As senhas não coincidem')
    .required('Obrigatório'),
});

const ROLE_LABELS = { ADMIN: 'Administrador', GESTOR: 'Gestor', INSPECTOR: 'Inspetor', VIEWER: 'Visualizador' };

/** Quem administra prédio não se vincula a prédio: a seção de chave não é dele. */
function ownsBuildings(role) {
  return role === 'ADMIN' || role === 'GESTOR';
}

/**
 * Foto com o botão de troca por cima.
 *
 * O lápis fica no canto do círculo, e não numa linha à parte, porque é a foto
 * que ele edita — separar os dois obriga a explicar por escrito o que a
 * proximidade já diz.
 */
function EditableAvatar({ user, size, onEdit }) {
  const badge = Math.round(size * 0.3);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <Avatar user={user} size={size} />
      <button
        onClick={onEdit}
        aria-label="Trocar foto de perfil"
        title="Trocar foto de perfil"
        className="transition-transform duration-150 hover:scale-110"
        style={{
          position: 'absolute', right: 0, bottom: 0,
          width: badge, height: badge, borderRadius: '50%',
          background: T.chip, border: `2px solid ${T.bg}`, color: T.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <Pencil size={Math.round(badge * 0.44)} />
      </button>
    </div>
  );
}

// ── Peças do perfil no telefone ───────────────────────────────────────────────
// A tela deixou de ser uma pilha de formulários abertos: os campos moram em
// caixas, e o que fica à vista é só o que a pessoa é e para onde ela pode ir.
// Formulário aberto ocupa altura mesmo sem ninguém precisar dele.

/** Dado da conta que não se edita aqui — função e prédio. */
function MobileTile({ label, value }) {
  return (
    <div style={{ background: M.card, borderRadius: 20, padding: '14px 16px', minWidth: 0 }}>
      <p style={{
        fontFamily: M.display, fontWeight: 600, fontSize: 15, color: M.text,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </p>
      <p style={{ color: M.mute, fontSize: 12, marginTop: 3 }}>{label}</p>
    </div>
  );
}

function MobileGroup({ title }) {
  return (
    <p style={{ color: M.mute, fontSize: 13, margin: '22px 0 8px 4px' }}>{title}</p>
  );
}

/** Linha que abre alguma coisa. Alvo de 56px, que é o mínimo confortável. */
function MobileRow({ icon: Icon, label, hint, tone, onClick }) {
  const color = tone === 'danger' ? M.danger : M.text;
  return (
    <button
      onClick={onClick}
      className="transition-colors duration-150"
      style={{
        width: '100%', minHeight: 56, background: M.card, border: 'none', borderRadius: 20,
        padding: '0 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
        textAlign: 'left', marginBottom: 8,
      }}
    >
      <Icon size={18} color={color} strokeWidth={1.8} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, color }}>{label}</span>
      {hint && (
        <span style={{ color: M.faint, fontSize: 13, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hint}
        </span>
      )}
      <ChevronRight size={18} color={M.faint} style={{ flexShrink: 0 }} />
    </button>
  );
}

// Tokens do desktop desta tela — os mesmos do produto.
const DS = {
  page: T.bg,
  panel: HERO_SURFACE,
  hairline: T.line,
  gold: T.accent,
  dim: T.mute,
  faint: T.faint,
  danger: T.danger,
};

/**
 * Credencial de acesso: quem você é dentro do prédio.
 * Único cartão do produto com gradiente — cinco pontos de luminância, só para
 * dar volume. Sem brilho, sem borda dourada, sem sombra.
 */
function Credential({ user, building, onEditAvatar }) {
  const ownerLabel = user?.role === 'GESTOR' ? 'Os que você criou' : 'Todos os prédios';
  const rows = [
    ['Função', ROLE_LABELS[user?.role] || user?.role || '—'],
    ['Prédio', building?.name ?? (ownsBuildings(user?.role) ? ownerLabel : 'Sem vínculo')],
  ];

  return (
    <div style={{ position: 'sticky', top: 108, background: DS.panel, borderRadius: R.card, padding: 22 }}>
      <EditableAvatar user={user} size={56} onEdit={onEditAvatar} />

      <p style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 19, lineHeight: 1.2, letterSpacing: '-0.015em', marginTop: 15, color: T.text }}>
        {user?.name ?? ''}
      </p>

      <p style={{ fontSize: 12, color: DS.dim, marginTop: 3, wordBreak: 'break-all' }}>
        {user?.email}
      </p>

      <div style={{ height: 1, background: DS.hairline, margin: '18px 0 4px' }} />

      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '12px 0', borderBottom: `1px solid ${DS.hairline}` }}>
          <span style={{ fontSize: 11, color: DS.faint }}>{label}</span>
          <span style={{ color: T.text, fontSize: 13, fontWeight: W.strong, textAlign: 'right' }}>{value}</span>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
        <Logo size={13} style={{ color: DS.dim, WebkitTextStroke: '0px' }} />
        <span style={{ fontSize: 11, color: DS.faint, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em' }}>
          Nº {(user?.id ?? '').slice(0, 8).toUpperCase() || '—'}
        </span>
      </div>
    </div>
  );
}

/**
 * As duas árvores da tela (desktop e mobile) ficam no DOM ao mesmo tempo — quem
 * esconde uma delas é o CSS. Por isso cada uma precisa da própria instância de
 * `useForm`: registrando o mesmo campo duas vezes, o react-hook-form guarda a
 * referência do último input montado (o da árvore escondida) e é de lá que ele
 * lê o valor a cada digitação. Quem editava pelo desktop enviava sempre o valor
 * antigo — era o que travava a troca de nome do visualizador, que só entra pelo
 * desktop.
 */
function IdentityForm({ variant, user }) {
  const isMobile = variant === 'mobile';
  const Field = isMobile ? MField : Input;
  const setUser = useAuthStore((s) => s.setUser);
  const { show: toast } = useToastStore();
  const updateMe = useUpdateMe();

  const form = useForm({
    resolver: yupResolver(profileSchema),
    // `values` e não `defaultValues`: o usuário chega depois da primeira
    // renderização, e os campos precisam acompanhar quando ele chegar.
    values: { name: user?.name ?? '', email: user?.email ?? '' },
  });

  async function onSubmit(data) {
    try {
      const updated = await updateMe.mutateAsync(data);
      setUser(updated);
      toast('Perfil atualizado!', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao atualizar', 'error');
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      style={{ display: 'flex', flexDirection: 'column', gap: 14, ...(isMobile ? {} : { maxWidth: 420 }) }}
    >
      <Field label="Nome" error={form.formState.errors.name?.message} {...form.register('name')} />
      <Field label="E-mail" type="email" error={form.formState.errors.email?.message} {...form.register('email')} />
      {isMobile ? (
        <MButton type="submit" loading={updateMe.isPending} style={{ width: '100%' }}>Salvar alterações</MButton>
      ) : (
        <Button type="submit" loading={updateMe.isPending} style={{ alignSelf: 'flex-start' }}>Salvar alterações</Button>
      )}
    </form>
  );
}

/** Troca de senha. Instância própria por árvore, pelo mesmo motivo do IdentityForm. */
function PasswordForm({ variant }) {
  const isMobile = variant === 'mobile';
  const Field = isMobile ? MField : Input;
  const { show: toast } = useToastStore();
  const changePassword = useChangePassword();

  const form = useForm({ resolver: yupResolver(passwordSchema) });

  // A confirmação existe só para o dedo errar menos; a API recebe as duas senhas.
  async function onSubmit({ new_password_confirmation, ...data }) {
    try {
      await changePassword.mutateAsync(data);
      form.reset();
      toast('Senha alterada com sucesso!', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Senha atual incorreta', 'error');
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      style={{ display: 'flex', flexDirection: 'column', gap: 14, ...(isMobile ? {} : { maxWidth: 420 }) }}
    >
      <Field label="Senha atual" type="password" error={form.formState.errors.current_password?.message} {...form.register('current_password')} />
      <Field label="Nova senha" type="password" error={form.formState.errors.new_password?.message} {...form.register('new_password')} />
      <Field label="Confirmar nova senha" type="password" error={form.formState.errors.new_password_confirmation?.message} {...form.register('new_password_confirmation')} />
      {isMobile ? (
        <MButton type="submit" loading={changePassword.isPending} style={{ width: '100%' }}>Alterar senha</MButton>
      ) : (
        <Button type="submit" loading={changePassword.isPending} style={{ alignSelf: 'flex-start' }}>Alterar senha</Button>
      )}
    </form>
  );
}

/** Linha da folha de dados: rótulo à esquerda, controles à direita, filete entre elas. */
function SpecRow({ label, hint, children }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 32, padding: '28px 0', borderTop: `1px solid ${DS.hairline}` }}>
      <div>
        <h2 style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text }}>{label}</h2>
        {hint && <p style={{ color: DS.faint, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{hint}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

export default function PerfilPage() {
  const { user, logout } = useAuthStore();
  const { show: toast } = useToastStore();
  const router = useRouter();
  const [deleteModal, setDeleteModal] = useState(false);
  // Qual caixa do telefone está aberta: 'identity' | 'password' | 'building'
  const [sheet, setSheet] = useState(null);
  const [avatarModal, setAvatarModal] = useState(false);

  const deleteMe = useDeleteMe();
  const leaveBuilding = useLeaveBuilding();

  const { data: myBuildings = [], isLoading: buildingsLoading } = useMyBuildings();
  const hasBuilding = myBuildings.length > 0;
  const myBuilding = myBuildings[0];

  async function handleLeave() {
    if (!confirm('Tem certeza que deseja sair deste prédio?')) return;
    try {
      await leaveBuilding.mutateAsync(myBuilding.id);
      toast('Você saiu do prédio', 'info');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao sair do prédio', 'error');
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
    if (ownsBuildings(user?.role)) return null;

    const content = (
      <>
        {buildingsLoading ? (
          <div style={{ height: 48, background: '#232323', borderRadius: 12 }} />
        ) : hasBuilding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Building2 size={18} color="#F5C518" />
              <div>
                <p style={{ color: 'rgba(255,255,255,0.96)', fontWeight: 600, fontSize: 14 }}>{myBuilding.name}</p>
                {myBuilding.description && <p style={{ color: 'rgba(255,255,255,0.44)', fontSize: 12, marginTop: 2 }}>{myBuilding.description}</p>}
              </div>
            </div>
            <button onClick={handleLeave} disabled={leaveBuilding.isPending}
              className="w-full text-sm text-red-400 border border-red-900/40 bg-red-900/10 rounded-2xl py-2.5 hover:bg-red-900/20 transition-colors disabled:opacity-50">
              {leaveBuilding.isPending ? 'Saindo...' : 'Sair deste prédio'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: 'rgba(255,255,255,0.26)', fontSize: 13 }}>Você não está vinculado a nenhum prédio.</p>
            <JoinBuildingForm />
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
        <header style={{ position: 'sticky', top: 0, height: 60, background: 'rgba(10,10,17,0.82)', borderBottom: `1px solid ${DS.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', zIndex: 10 }}>
          <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.44)', fontSize: 14 }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.96)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.44)'}>
            <ArrowLeft size={18} /> Voltar
          </button>
          <Logo size={16} />
          <button onClick={() => { logout(); router.replace('/login'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.44)', fontSize: 13 }}
            onMouseEnter={e => e.currentTarget.style.color = DS.danger}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.44)'}>
            <LogOut size={16} /> Sair
          </button>
        </header>

        <div style={{ maxWidth: 1060, margin: '0 auto', padding: '48px 32px 80px', display: 'grid', gridTemplateColumns: '320px 1fr', gap: 48, alignItems: 'start' }}>
          <Credential user={user} building={myBuilding} onEditAvatar={() => setAvatarModal(true)} />

          <div>
            <h1 style={{ fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 900, fontSize: 30, color: 'rgba(255,255,255,0.94)', letterSpacing: '-0.01em' }}>
              Sua conta
            </h1>
            <p style={{ color: DS.dim, fontSize: 14, marginTop: 6, maxWidth: 460 }}>
              Estes dados aparecem nos relatórios que você assina e definem seu acesso ao prédio.
            </p>

            <div style={{ marginTop: 36 }}>
              <SpecRow label="Identificação" hint="Nome e e-mail que assinam suas vistorias">
                <IdentityForm variant="desktop" user={user} />
              </SpecRow>

              <SpecRow label="Senha" hint="Mínimo de 8 caracteres">
                <PasswordForm variant="desktop" />
              </SpecRow>

              {!ownsBuildings(user?.role) && (
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
          {/* Mesmo respiro do topo que o MTopBar dá nas outras telas mobile —
              sem ele o botão encosta na barra de status do telefone. */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '52px 0 4px' }}>
            <MRound label="Voltar" onClick={() => router.back()}>
              <ArrowLeft size={18} />
            </MRound>
          </div>

          {/* Quem é a pessoa, no centro e sem concorrência */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '18px 0 26px' }}>
            <EditableAvatar user={user} size={88} onEdit={() => setAvatarModal(true)} />
            <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 21, color: M.text, marginTop: 16 }}>
              {user?.name}
            </p>
            <p style={{ color: M.mute, fontSize: 13, marginTop: 4, wordBreak: 'break-all' }}>
              {user?.email}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MobileTile label="Função" value={ROLE_LABELS[user?.role] || user?.role || '—'} />
            <MobileTile
              label="Prédio"
              value={myBuilding?.name ?? (ownsBuildings(user?.role) ? 'Todos os seus' : 'Sem vínculo')}
            />
          </div>

          <MobileGroup title="Conta" />
          <MobileRow icon={UserRound} label="Identificação" onClick={() => setSheet('identity')} />
          {!ownsBuildings(user?.role) && (
            <MobileRow
              icon={Building2}
              label="Prédio"
              hint={hasBuilding ? myBuilding?.name : 'Sem vínculo'}
              onClick={() => setSheet('building')}
            />
          )}

          <MobileGroup title="Segurança" />
          <MobileRow icon={KeyRound} label="Alterar senha" onClick={() => setSheet('password')} />

          <MobileGroup title="Zona de risco" />
          <MobileRow icon={Trash2} label="Excluir conta" tone="danger" onClick={() => setDeleteModal(true)} />

          <button
            onClick={() => { logout(); router.replace('/login'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none',
              cursor: 'pointer', color: M.danger, fontSize: 15, fontWeight: 500,
              padding: '22px 4px 8px',
            }}
          >
            <LogOut size={18} strokeWidth={1.8} /> Sair
          </button>

          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 18 }}>
            <Logo size={13} style={{ color: M.faint, WebkitTextStroke: '0px' }} />
          </div>

          {/* O gestor não tem home nem histórico próprios: a barra não é dele. */}
          {user?.role !== 'GESTOR' && <BottomNav />}
        </MPage>
      </div>

      <AvatarEditorModal open={avatarModal} onClose={() => setAvatarModal(false)} />

      {/* As caixas do telefone: cada linha da lista abre a sua */}
      <Modal open={sheet === 'identity'} onClose={() => setSheet(null)} title="Identificação">
        <IdentityForm variant="mobile" user={user} />
      </Modal>

      <Modal open={sheet === 'password'} onClose={() => setSheet(null)} title="Alterar senha">
        <PasswordForm variant="mobile" />
      </Modal>

      <Modal open={sheet === 'building'} onClose={() => setSheet(null)} title="Prédio vinculado">
        {BuildingSection({ bare: true })}
      </Modal>

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
