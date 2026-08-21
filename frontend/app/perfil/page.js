'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { LogOut, ArrowLeft, Building2, Check, ChevronRight, KeyRound, MessageSquarePlus, Pencil, Trash2, UserRound } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Avatar } from '@/app/components/Avatar';
import { AvatarEditorModal } from '@/app/components/AvatarEditorModal';
import { JoinBuildingForm } from '@/app/components/JoinBuildingForm';
import { Logo } from '@/app/components/Logo';
import { M, MPage, MRound, MField, MButton } from '@/app/components/mobile/kit';
import { BottomNav } from '@/app/components/BottomNav';
import { Button, Modal, Textarea } from '@/app/components/ui';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';
import {
  useUpdateMe,
  useChangePassword,
  useDeleteMe,
  useMyBuildings,
  useLeaveBuilding,
  useSendFeedback,
  useMyFeedbacks,
} from '@/app/hooks/useApi';
import { isManager, isManagerAccount, roleLabel } from '@/app/lib/roles';
import { T, R, W, NUM, HERO_SURFACE } from '@/app/lib/theme';

const profileSchema = yup.object({
  name: yup.string().min(2).required('Obrigatório'),
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
});

const feedbackSchema = yup.object({
  message: yup
    .string()
    .trim()
    .min(5, 'Escreva ao menos 5 caracteres')
    .max(2000, 'Máximo de 2000 caracteres')
    .required('Obrigatório'),
});

const passwordSchema = yup.object({
  current_password: yup.string().required('Obrigatório'),
  new_password: yup.string().min(8, 'Mínimo 8 caracteres').required('Obrigatório'),
  new_password_confirmation: yup
    .string()
    .oneOf([yup.ref('new_password')], 'As senhas não coincidem')
    .required('Obrigatório'),
});

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

// ── Peças do perfil ───────────────────────────────────────────────────────────
// A tela deixou de ser uma pilha de formulários abertos: os campos moram em
// caixas, e o que fica à vista é só o que a pessoa é e para onde ela pode ir.
// Formulário aberto ocupa altura mesmo sem ninguém precisar dele.
//
// O desktop lê a mesma coisa: as peças abaixo servem as duas larguras, e o que
// muda entre elas é a medida da coluna e as classes de animação de entrada.

/** Dado da conta que não se edita aqui — função e prédio. */
function Tile({ label, value, className = '' }) {
  return (
    <div className={className} style={{ background: T.card, borderRadius: 20, padding: '14px 16px', minWidth: 0 }}>
      <p style={{
        fontFamily: T.display, fontWeight: W.title, fontSize: 15, color: T.text,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </p>
      <p style={{ color: T.mute, fontSize: 12, marginTop: 3 }}>{label}</p>
    </div>
  );
}

function Group({ title, className = '' }) {
  return (
    <p className={className} style={{ color: T.mute, fontSize: 13, margin: '22px 0 8px 4px' }}>{title}</p>
  );
}

/** Linha que abre alguma coisa. Alvo de 56px, que é o mínimo confortável. */
function Row({ icon: Icon, label, hint, tone, onClick, className = '' }) {
  const color = tone === 'danger' ? T.danger : T.text;
  return (
    <button
      onClick={onClick}
      className={`profile-row ${className}`}
      style={{
        width: '100%', minHeight: 56, background: T.card, border: 'none', borderRadius: 20,
        padding: '0 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
        textAlign: 'left', marginBottom: 8,
      }}
    >
      <Icon size={18} color={color} strokeWidth={1.8} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, color }}>{label}</span>
      {hint && (
        <span style={{ color: T.faint, fontSize: 13, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hint}
        </span>
      )}
      <ChevronRight size={18} color={T.faint} className="profile-row__chevron" style={{ flexShrink: 0 }} />
    </button>
  );
}

/**
 * Credencial: quem a pessoa é, sem concorrência.
 *
 * Único cartão do produto com gradiente — cinco pontos de luminância, só para
 * dar volume. Sem brilho, sem borda dourada, sem sombra. No telefone a mesma
 * identidade aparece solta sobre o fundo; aqui ela ganha a moldura porque a
 * coluna é larga e o cartão é o que segura o olho no centro.
 */
function Credential({ user, onEditAvatar }) {
  return (
    <section
      className="anim-fade-up"
      style={{
        background: HERO_SURFACE, borderRadius: R.card, padding: 28,
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      }}
    >
      <div className="anim-pop-in">
        <EditableAvatar user={user} size={88} onEdit={onEditAvatar} />
      </div>

      <p className="anim-fade-up anim-d1" style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 22, letterSpacing: '-0.015em', color: T.text, marginTop: 16 }}>
        {user?.name ?? ''}
      </p>
      <p className="anim-fade-up anim-d2" style={{ color: T.mute, fontSize: 13, marginTop: 4, wordBreak: 'break-all' }}>
        {user?.email}
      </p>

      <div style={{ alignSelf: 'stretch', height: 1, background: T.line, margin: '22px 0 14px' }} />

      <div style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo size={13} style={{ color: T.mute, WebkitTextStroke: '0px' }} />
        <span style={{ fontSize: 11, color: T.faint, ...NUM, letterSpacing: '0.06em' }}>
          Nº {(user?.id ?? '').slice(0, 8).toUpperCase() || '—'}
        </span>
      </div>
    </section>
  );
}

/**
 * As duas árvores da tela (desktop e mobile) ficam no DOM ao mesmo tempo — quem
 * esconde uma delas é o CSS. Registrar o mesmo campo duas vezes quebrava a
 * edição: o react-hook-form guarda a referência do último input montado (o da
 * árvore escondida) e lia dali o valor a cada digitação, então o desktop
 * enviava sempre o nome antigo.
 *
 * Hoje o formulário mora só na caixa, que é única para as duas larguras — uma
 * instância, um registro, sem árvore escondida competindo.
 */
function IdentityForm({ user }) {
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
    <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <MField label="Nome" error={form.formState.errors.name?.message} {...form.register('name')} />
      <MField label="E-mail" type="email" error={form.formState.errors.email?.message} {...form.register('email')} />
      <MButton type="submit" loading={updateMe.isPending} style={{ width: '100%' }}>Salvar alterações</MButton>
    </form>
  );
}

/** Troca de senha. Mesma caixa única do IdentityForm. */
function PasswordForm() {
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
    <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <MField label="Senha atual" type="password" error={form.formState.errors.current_password?.message} {...form.register('current_password')} />
      <MField label="Nova senha" type="password" error={form.formState.errors.new_password?.message} {...form.register('new_password')} />
      <MField label="Confirmar nova senha" type="password" error={form.formState.errors.new_password_confirmation?.message} {...form.register('new_password_confirmation')} />
      <MButton type="submit" loading={changePassword.isPending} style={{ width: '100%' }}>Alterar senha</MButton>
    </form>
  );
}

/**
 * Fala com o administrador.
 *
 * Uma caixa só, e não uma tela à parte: o que a pessoa quer é escrever e sair.
 * Abaixo do campo ficam os envios anteriores, porque a pergunta de quem já
 * mandou algo é "chegou?" — e sem essa lista a única resposta possível seria
 * mandar de novo.
 *
 * Todos aparecem como recebidos, e é tudo o que a lista diz. O que o admin faz
 * depois — pôr na lista de tarefas, guardar como mensagem — é trabalho dele, e
 * o que ele descarta some daqui: dizer "seu feedback foi descartado" não ajuda
 * ninguém e só desanima o próximo envio.
 */
function FeedbackBox() {
  const { show: toast } = useToastStore();
  const sendFeedback = useSendFeedback();
  const { data: sent = [], isLoading } = useMyFeedbacks();

  const form = useForm({ resolver: yupResolver(feedbackSchema), defaultValues: { message: '' } });

  async function onSubmit({ message }) {
    try {
      await sendFeedback.mutateAsync(message);
      form.reset({ message: '' });
      toast('Feedback enviado', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao enviar feedback', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Textarea
          label="Sua sugestão"
          placeholder="O que dá para melhorar? O que está funcionando bem?"
          error={form.formState.errors.message?.message}
          hint="Vai direto para o administrador do sistema."
          {...form.register('message')}
        />
        <MButton type="submit" loading={sendFeedback.isPending} style={{ width: '100%' }}>Enviar feedback</MButton>
      </form>

      {isLoading ? (
        <div style={{ height: 48, background: T.chip, borderRadius: 14 }} />
      ) : sent.length > 0 && (
        <>
          <div style={{ height: 1, background: T.line, margin: '4px 0' }} />
          <p style={{ color: T.mute, fontSize: 13 }}>Você já mandou</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
            {sent.map((item) => (
              <div key={item.id} style={{ background: T.chip, borderRadius: 14, padding: '11px 13px' }}>
                <p style={{ color: T.text, fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{item.message}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#4ade80', fontSize: 11 }}>
                    <Check size={12} strokeWidth={2.4} /> Recebido
                  </span>
                  <span style={{ color: T.faint, fontSize: 11 }}>
                    {format(new Date(item.created_at), "d/MM/yyyy 'às' HH:mm")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function PerfilPage() {
  const { user, logout, clearSession } = useAuthStore();
  const { show: toast } = useToastStore();
  const router = useRouter();
  const [deleteModal, setDeleteModal] = useState(false);
  // Qual caixa está aberta: 'identity' | 'password' | 'building'
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
      await leaveBuilding.mutateAsync(myBuilding.building_id);
      toast('Você saiu do prédio', 'info');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao sair do prédio', 'error');
    }
  }

  async function handleDelete() {
    try {
      await deleteMe.mutateAsync();
      // A conta já foi apagada: não há sessão a encerrar no servidor, só o que
      // limpar daqui.
      clearSession();
      router.replace('/login');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao excluir conta', 'error');
    }
  }

  /** Conteúdo da caixa "Prédio vinculado" — a mesma nas duas larguras. */
  function BuildingSection() {
    if (isManager(user)) return null;

    return (
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
  }

  return (
    <RouteGuard>
      {/* ── DESKTOP ── */}
      <div className="hidden lg:block min-h-screen" style={{ background: T.bg }}>
        <header
          className="anim-fade-down"
          style={{ position: 'sticky', top: 0, height: 60, background: 'rgba(11,11,11,0.82)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', zIndex: 10 }}
        >
          <button onClick={() => router.back()} className="transition-colors duration-150" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: T.mute, fontSize: 14 }}
            onMouseEnter={e => e.currentTarget.style.color = T.text}
            onMouseLeave={e => e.currentTarget.style.color = T.mute}>
            <ArrowLeft size={18} /> Voltar
          </button>
          <Logo size={16} />
          <button onClick={async () => { await logout(); router.replace('/login'); }}
            className="transition-colors duration-150"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: T.mute, fontSize: 13 }}
            onMouseEnter={e => e.currentTarget.style.color = T.danger}
            onMouseLeave={e => e.currentTarget.style.color = T.mute}>
            <LogOut size={16} /> Sair
          </button>
        </header>

        {/* Coluna estreita de propósito: a leitura é a mesma do telefone, e uma
            lista de linhas esticada por 1000px perde o alvo do clique. */}
        <div style={{ maxWidth: 620, margin: '0 auto', padding: '44px 24px 88px' }}>
          <Credential user={user} onEditAvatar={() => setAvatarModal(true)} />

          <div className="anim-fade-up anim-d3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <Tile label="Função" value={roleLabel(user)} />
            <Tile
              label="Prédio"
              value={isManager(user) ? 'Todos os seus' : myBuilding?.name ?? 'Sem vínculo'}
            />
          </div>

          <Group title="Conta" className="anim-fade-up anim-d3" />
          <Row className="anim-fade-up anim-d4" icon={UserRound} label="Identificação" hint={user?.email} onClick={() => setSheet('identity')} />
          {!isManager(user) && (
            <Row
              className="anim-fade-up anim-d4"
              icon={Building2}
              label="Prédio"
              hint={hasBuilding ? myBuilding?.name : 'Sem vínculo'}
              onClick={() => setSheet('building')}
            />
          )}

          <Group title="Segurança" className="anim-fade-up anim-d5" />
          <Row className="anim-fade-up anim-d5" icon={KeyRound} label="Alterar senha" onClick={() => setSheet('password')} />

          <Group title="Feedback" className="anim-fade-up anim-d5" />
          <Row
            className="anim-fade-up anim-d5"
            icon={MessageSquarePlus}
            label="Enviar feedback"
            hint="Para o administrador"
            onClick={() => setSheet('feedback')}
          />

          <Group title="Zona de risco" className="anim-fade-up anim-d6" />
          <Row className="anim-fade-up anim-d6" icon={Trash2} label="Excluir conta" tone="danger" onClick={() => setDeleteModal(true)} />
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
            <Tile label="Função" value={roleLabel(user)} />
            <Tile
              label="Prédio"
              value={isManager(user) ? 'Todos os seus' : myBuilding?.name ?? 'Sem vínculo'}
            />
          </div>

          <Group title="Conta" />
          <Row icon={UserRound} label="Identificação" onClick={() => setSheet('identity')} />
          {!isManager(user) && (
            <Row
              icon={Building2}
              label="Prédio"
              hint={hasBuilding ? myBuilding?.name : 'Sem vínculo'}
              onClick={() => setSheet('building')}
            />
          )}

          <Group title="Segurança" />
          <Row icon={KeyRound} label="Alterar senha" onClick={() => setSheet('password')} />

          <Group title="Feedback" />
          <Row
            icon={MessageSquarePlus}
            label="Enviar feedback"
            hint="Para o administrador"
            onClick={() => setSheet('feedback')}
          />

          <Group title="Zona de risco" />
          <Row icon={Trash2} label="Excluir conta" tone="danger" onClick={() => setDeleteModal(true)} />

          <button
            onClick={async () => { await logout(); router.replace('/login'); }}
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
          {!isManager(user) && <BottomNav />}
        </MPage>
      </div>

      <AvatarEditorModal open={avatarModal} onClose={() => setAvatarModal(false)} />

      {/* As caixas: cada linha da lista abre a sua, no telefone e no computador */}
      <Modal open={sheet === 'identity'} onClose={() => setSheet(null)} title="Identificação" maxWidth={440}>
        <IdentityForm user={user} />
      </Modal>

      <Modal open={sheet === 'password'} onClose={() => setSheet(null)} title="Alterar senha" maxWidth={440}>
        <PasswordForm />
      </Modal>

      <Modal open={sheet === 'feedback'} onClose={() => setSheet(null)} title="Enviar feedback" maxWidth={440}>
        <FeedbackBox />
      </Modal>

      {/* Chamada como função, não como <BuildingSection />: declarada dentro da
          página, ela seria um tipo novo a cada render e o campo da chave perderia
          o foco a cada tecla. */}
      <Modal open={sheet === 'building'} onClose={() => setSheet(null)} title="Prédio vinculado" maxWidth={440}>
        {BuildingSection()}
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
