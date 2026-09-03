'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { useForm, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { LogOut, ArrowLeft, Building2, Check, ChevronRight, KeyRound, MessageSquarePlus, Palette, Pencil, Trash2, UserRound } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { SenhaChecklist, senhaValida, useFocoSenha } from '@/app/components/SenhaChecklist';
import { Avatar } from '@/app/components/Avatar';
import { AvatarEditorModal } from '@/app/components/AvatarEditorModal';
import { SeletorDeTema } from '@/app/components/SeletorDeTema';
import { JoinBuildingForm } from '@/app/components/JoinBuildingForm';
import { Logo } from '@/app/components/Logo';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { GestorSidebar } from '@/app/components/GestorSidebar';
import { ModeradorSidebar } from '@/app/components/ModeradorSidebar';
import { M, MPage, MRound, MField, MButton, RESPIRO_TOPO, CONTENT_ID } from '@/app/components/mobile/kit';
import { BottomNav } from '@/app/components/BottomNav';
import { Button, Modal, Textarea } from '@/app/components/ui';
import { UnsavedChangesModal } from '@/app/components/ConfirmModal';
import { UnsavedScope, useUnsavedField, useUnsavedGuard, useUnsavedScope } from '@/app/hooks/useUnsavedGuard';
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
import { isAdmin, isManager, isManagerAccount, managedBuildings, moderatedBuilding, roleLabel } from '@/app/lib/roles';
import { useTheme } from '@/app/lib/tema';
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
  new_password: yup
    .string()
    .required('Obrigatório')
    .test('forte', 'A senha não cumpre os requisitos', (v) => senhaValida(v ?? '')),
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
    <div className={className} style={{ background: T.card, borderRadius: 20, boxShadow: T.cardRing, padding: '14px 16px', minWidth: 0 }}>
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
    <p className={className} style={{ color: T.mute, fontSize: 14, margin: '22px 0 8px 4px' }}>{title}</p>
  );
}

/** Linha que abre alguma coisa. Alvo de 56px, que é o mínimo confortável. */
function Row({ icon: Icon, label, hint, tone, onClick, className = '' }) {
  const color = tone === 'danger' ? T.danger : T.text;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`profile-row ${className}`}
      style={{
        width: '100%', minHeight: 56, background: T.card, border: 'none', borderRadius: 20, boxShadow: T.cardRing,
        padding: '0 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
        textAlign: 'left', marginBottom: 8,
      }}
    >
      <Icon size={18} color={color} strokeWidth={1.8} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, color }}>{label}</span>
      {hint && (
        <span style={{ color: T.faint, fontSize: 14, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hint}
        </span>
      )}
      <ChevronRight size={18} color={T.faint} className="profile-row__chevron" style={{ flexShrink: 0 }} />
    </button>
  );
}

/**
 * A barra lateral da conta, escolhida pelo papel de quem entrou.
 *
 * O perfil é a única tela que todo mundo alcança, e até aqui ela saía de dentro
 * do lugar onde a pessoa estava: o moderador clicava em "Perfil" no rodapé do
 * menu e o menu sumia. Sair da área para mexer na conta é o tipo de troca que
 * faz a pessoa perder o fio de onde estava.
 *
 * Quem não tem barra — inspetor, quem só acompanha, conta sem vínculo — não
 * ganha uma: a área dessas contas não tem menu lateral em lugar nenhum, e
 * inventar um só aqui seria mostrar um caminho que não existe nas outras telas.
 */
function BarraLateralDaConta({ user, buildingId }) {
  const predioModerado = moderatedBuilding(user);
  const prediosGeridos = managedBuildings(user);
  const predioGerido = buildingId
    ? prediosGeridos.find((b) => b.building_id === buildingId)
    : null;

  if (isAdmin(user)) return <AdminSidebar />;
  if (isManagerAccount(user)) {
    if (predioGerido) {
      return <GestorSidebar buildingId={predioGerido.building_id} buildingName={predioGerido.name} />;
    }
    return null;
  }
  if (predioModerado) {
    return <ModeradorSidebar buildingId={predioModerado.building_id} buildingName={predioModerado.name} />;
  }
  return null;
}

/** Se esta conta tem barra lateral — a mesma pergunta que `BarraLateralDaConta` responde. */
function contaTemBarra(user, buildingId) {
  if (isAdmin(user)) return true;
  if (isManagerAccount(user)) {
    return Boolean(buildingId && managedBuildings(user).some((b) => b.building_id === buildingId));
  }
  return Boolean(moderatedBuilding(user));
}

/**
 * Uma seção na coluna da esquerda.
 *
 * Pílula preenchida quando aberta, e não um filete na borda: a coluna é curta e
 * o preenchimento é o que se enxerga sem procurar. "Excluir conta" é a única
 * vermelha, e fica separada do resto por um respiro — no fim da lista, longe do
 * dedo que só queria trocar de seção.
 */
function AbaDaConta({ label, ativa, tone, onClick }) {
  const cor = tone === 'danger' ? T.danger : ativa ? T.accentInk : T.mute;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={ativa ? 'page' : undefined}
      className="btn"
      style={{
        display: 'flex', alignItems: 'center', width: '100%',
        background: ativa ? T.accentSoft : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        padding: '9px 12px', borderRadius: R.control,
        color: cor, fontFamily: T.display, fontSize: 13,
        fontWeight: ativa ? W.title : W.body,
        marginTop: tone === 'danger' ? 10 : 0,
        '--btn-hover': tone === 'danger' ? T.dangerSoft : T.chip,
      }}
    >
      {label}
    </button>
  );
}

/**
 * Um bloco de informação do painel, com a ação que o edita no canto.
 *
 * É a forma que a tela de configurações do produto passou a ter: o valor à
 * vista, e editar como um gesto à parte. Antes cada linha era um botão que
 * abria uma caixa — para conferir o próprio e-mail era preciso abrir o
 * formulário que o altera, e sair dele sem mexer em nada.
 */
function Bloco({ titulo, acao, children }) {
  return (
    <section style={{ background: T.chip, borderRadius: R.control, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: children ? 14 : 0 }}>
        <h3 style={{ color: T.text, fontSize: 14, fontWeight: W.title }}>{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** O botão de editar de um bloco — discreto, porque ler é o que se faz mais. */
function BotaoEditar({ label = 'Editar', onClick, tone = 'neutral' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        background: 'transparent', border: `1px solid ${T.line}`, cursor: 'pointer',
        padding: '6px 12px', borderRadius: R.pill,
        color: tone === 'danger' ? T.danger : T.text,
        fontFamily: T.display, fontSize: 12, fontWeight: W.strong,
        '--btn-hover': tone === 'danger' ? T.dangerSoft : T.hover,
      }}
    >
      {label} <Pencil size={12} />
    </button>
  );
}

/** Um par rótulo/valor dentro de um bloco. */
function Campo({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ color: T.mute, fontSize: 12 }}>{label}</p>
      <p style={{ color: T.text, fontSize: 14, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </p>
    </div>
  );
}

/**
 * Dois campos por linha, como na folha de cadastro que a tela imita.
 *
 * Duas colunas fixas, e não `auto-fit`: o painel é largo, e `auto-fit` punha
 * quatro campos numa fileira só — a leitura deixava de ser de cima para baixo e
 * virava uma tabela, que é outra coisa. Duas é o que faz cada par rótulo/valor
 * ainda parecer um campo de formulário.
 */
function Campos({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 24px' }}>
      {children}
    </div>
  );
}

/**
 * O título da seção, acima dos cartões dela.
 *
 * Fora dos cartões de propósito: ele nomeia o conjunto, e dentro do primeiro
 * cartão pareceria nomear só aquele. É o que a coluna da esquerda já diz — e
 * repetido aqui em cima, é o que confirma onde o clique levou.
 */
function TituloDaSecao({ children }) {
  return (
    <h2 style={{ color: T.text, fontSize: 15, fontWeight: W.title, marginBottom: 2 }}>{children}</h2>
  );
}

/**
 * O conteúdo de cada seção da conta.
 *
 * Os formulários continuam nas caixas que já existiam: elas são as mesmas do
 * telefone, e duplicá-las aqui criaria duas versões do mesmo formulário para
 * divergirem com o tempo. O que mudou é que agora se lê antes de abrir.
 */
function PainelDaConta({ secao, user, theme, buildingLabel, onEditarFoto, onAbrir, onExcluir, BuildingSection }) {
  if (secao === 'perfil') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TituloDaSecao>Meu perfil</TituloDaSecao>

        {/* Quem a pessoa é, no primeiro cartão e sem rótulo de bloco: o rosto e
            o nome dispensam alguém dizendo que ali está o rosto e o nome. O
            editar deste cartão é o da foto — cada cartão edita o que mostra. */}
        <section style={{ background: T.chip, borderRadius: R.control, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <EditableAvatar user={user} size={56} onEdit={onEditarFoto} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 16, color: T.text }}>{user?.name}</p>
            <p style={{ color: T.mute, fontSize: 13, marginTop: 2 }}>{roleLabel(user)}</p>
            <p style={{ color: T.faint, fontSize: 12, marginTop: 2 }}>
              {isManager(user) ? 'Todos os seus prédios' : buildingLabel}
            </p>
          </div>
          <BotaoEditar label="Trocar foto" onClick={onEditarFoto} />
        </section>

        <Bloco titulo="Informações pessoais" acao={<BotaoEditar onClick={() => onAbrir('identity')} />}>
          <Campos>
            <Campo label="Nome" value={user?.name ?? '—'} />
            <Campo label="E-mail" value={user?.email ?? '—'} />
            <Campo label="Função" value={roleLabel(user)} />
            <Campo label="Prédio" value={isManager(user) ? 'Todos os seus' : buildingLabel} />
          </Campos>
        </Bloco>
      </div>
    );
  }

  if (secao === 'seguranca') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TituloDaSecao>Segurança</TituloDaSecao>
        <Bloco titulo="Senha" acao={<BotaoEditar label="Alterar" onClick={() => onAbrir('password')} />}>
          <p style={{ color: T.mute, fontSize: 13, lineHeight: 1.6 }}>
            Trocar a senha encerra as sessões abertas nos outros aparelhos. Você
            continua conectado aqui.
          </p>
        </Bloco>
      </div>
    );
  }

  if (secao === 'aparencia') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TituloDaSecao>Aparência</TituloDaSecao>

        {/* As duas opções à vista, e não atrás de um botão que abriria uma
            caixa: o tema é a única configuração cujo resultado aparece na
            própria tela em que se escolhe. Escondê-lo num modal fazia a pessoa
            ver a mudança pela fresta do que estava por cima. */}
        <Bloco titulo="Tema">
          <SeletorDeTema />
        </Bloco>
      </div>
    );
  }

  if (secao === 'predio') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TituloDaSecao>Prédio</TituloDaSecao>
        <Bloco titulo="Prédio vinculado">
          <BuildingSection />
        </Bloco>
      </div>
    );
  }

  if (secao === 'feedback') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TituloDaSecao>Feedback</TituloDaSecao>
        <Bloco titulo="Enviar feedback" acao={<BotaoEditar label="Escrever" onClick={() => onAbrir('feedback')} />}>
          <p style={{ color: T.mute, fontSize: 13, lineHeight: 1.6 }}>
            O que faltou, o que atrapalhou, o que daria para melhorar. Vai direto
            para quem administra o sistema.
          </p>
        </Bloco>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TituloDaSecao>Excluir conta</TituloDaSecao>

      <Bloco titulo="Excluir conta" acao={<BotaoEditar label="Excluir" tone="danger" onClick={onExcluir} />}>
        <p style={{ color: T.mute, fontSize: 13, lineHeight: 1.6 }}>
          Sua conta e os vínculos com os prédios são apagados. As vistorias que
          você enviou continuam no histórico do prédio — elas são do prédio, e não
          da conta. Isto não tem volta.
        </p>
      </Bloco>
    </div>
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
        background: HERO_SURFACE, borderRadius: R.card, boxShadow: T.cardRing, padding: 28,
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      }}
    >
      <div className="anim-pop-in">
        <EditableAvatar user={user} size={88} onEdit={onEditAvatar} />
      </div>

      <p className="anim-fade-up anim-d1" style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 22, letterSpacing: '-0.015em', color: T.text, marginTop: 16 }}>
        {user?.name ?? ''}
      </p>
      <p className="anim-fade-up anim-d2" style={{ color: T.mute, fontSize: 14, marginTop: 4, wordBreak: 'break-all' }}>
        {user?.email}
      </p>

      <div style={{ alignSelf: 'stretch', height: 1, background: T.line, margin: '22px 0 14px' }} />

      <div style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo size={13} style={{ color: T.mute }} />
        <span style={{ fontSize: 12, color: T.faint, ...NUM, letterSpacing: '0.06em' }}>
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

  useUnsavedField(form.formState.isDirty);

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

  // Os três campos vazios, e não o formulário sem lista: ver a nota do
  // formulário de novo usuário em desktop/admin/page.js. Sem eles, `isDirty`
  // trava em verdadeiro depois da primeira tecla e nunca mais volta.
  const form = useForm({
    resolver: yupResolver(passwordSchema),
    defaultValues: { current_password: '', new_password: '', new_password_confirmation: '' },
  });

  useUnsavedField(form.formState.isDirty);

  // `useWatch` e nao `watch()`: o segundo devolve uma funcao nova a cada render
  // e o compilador do React desiste de memoizar o componente inteiro.
  const senhaNova = useWatch({ control: form.control, name: 'new_password' }) ?? '';
  const foco = useFocoSenha();

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
      {/* O invólucro é a âncora: o `MField` é um componente e não dá para lhe
          pôr `position: relative` de fora. Ver `.senha-regras`. */}
      <div style={{ position: 'relative' }} {...foco.ancora}>
        <MField label="Nova senha" type="password" error={form.formState.errors.new_password?.message} {...form.register('new_password')} />
        <SenhaChecklist senha={senhaNova} aberta={foco.aberta} />
      </div>
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

  useUnsavedField(form.formState.isDirty);

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
          <p style={{ color: T.mute, fontSize: 14 }}>Você já mandou</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
            {sent.map((item) => (
              <div key={item.id} style={{ background: T.chip, borderRadius: 14, padding: '11px 13px' }}>
                <p style={{ color: T.text, fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{item.message}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.success, fontSize: 12 }}>
                    <Check size={12} strokeWidth={2.4} /> Recebido
                  </span>
                  <span style={{ color: T.faint, fontSize: 12 }}>
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

function PerfilContent() {
  const { user, logout, clearSession } = useAuthStore();
  const { show: toast } = useToastStore();
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const buildingId = searchParams?.get('buildingId') ?? null;
  const [deleteModal, setDeleteModal] = useState(false);
  // Qual caixa está aberta: 'identity' | 'password' | 'building' | 'feedback'
  const [sheet, setSheet] = useState(null);
  const [avatarModal, setAvatarModal] = useState(false);

  /**
   * A saída das caixas de formulário.
   *
   * Uma caixa por vez: identificação, senha e feedback dividem o mesmo `sheet`,
   * então um escopo só dá conta das três — e é ele que sabe se há o que perder
   * quando alguém fecha no X, no Escape ou no fundo.
   */
  const { dirty, report } = useUnsavedScope();
  const saida = useUnsavedGuard(dirty);
  const fecharSheet = () => saida.guard(() => setSheet(null));

  /**
   * As seções da conta, na coluna da esquerda do desktop.
   *
   * A ordem é a de quem chega: primeiro quem eu sou, depois como entro, depois
   * como a tela me parece. "Prédio" só existe para quem tem um — o gestor
   * administra vários e não se desvincula de nenhum por aqui. Excluir fecha a
   * lista, separada e em vermelho, longe do dedo que só queria trocar de aba.
   */
  const secoes = [
    { id: 'perfil', label: 'Meu perfil' },
    { id: 'seguranca', label: 'Segurança' },
    { id: 'aparencia', label: 'Aparência' },
    !isManager(user) && { id: 'predio', label: 'Prédio' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'excluir', label: 'Excluir conta', tone: 'danger' },
  ].filter(Boolean);

  const [secao, setSecao] = useState('perfil');
  const secaoAtual = secoes.find((s) => s.id === secao) ?? secoes[0];
  const temBarra = contaTemBarra(user, buildingId);

  // Trocar de seção remonta o painel, e um formulário aberto numa caixa vive
  // fora dele — mas o que estiver escrito na caixa se perde ao fechá-la, e é a
  // mesma pergunta.
  const trocarSecao = (id) => id !== secao && saida.guard(() => setSecao(id));

  const deleteMe = useDeleteMe();
  const leaveBuilding = useLeaveBuilding();

  const { data: myBuildings = [], isLoading: buildingsLoading } = useMyBuildings();
  const hasBuilding = myBuildings.length > 0;
  const myBuilding = myBuildings[0];
  /**
   * O que a linha do perfil mostra como "prédio".
   *
   * Com mais de um vínculo, o nome do primeiro seria mentira por omissão — a
   * pessoa lia o perfil e concluía que só pertencia àquele.
   */
  const buildingLabel = !hasBuilding
    ? 'Sem vínculo'
    : myBuildings.length === 1
      ? myBuilding.name
      : `${myBuildings.length} prédios`;

  async function handleLeave(building) {
    if (!confirm(`Tem certeza que deseja sair de "${building.name}"?`)) return;
    try {
      await leaveBuilding.mutateAsync(building.building_id);
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
          <div style={{ height: 48, background: T.chip, borderRadius: 12 }} />
        ) : hasBuilding ? (
          // Todos os vínculos, e não só o primeiro. Quem trabalha em dois
          // prédios via um só aqui — e a saída aplicava sempre àquele.
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {myBuildings.map((building) => (
              <div key={building.building_id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Building2 size={18} color={T.accentInk} style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ color: T.text, fontWeight: 600, fontSize: 14 }}>{building.name}</p>
                    {building.description && <p style={{ color: T.mute, fontSize: 12, marginTop: 2 }}>{building.description}</p>}
                  </div>
                </div>
                <button type="button" onClick={() => handleLeave(building)} disabled={leaveBuilding.isPending}
                  className="w-full text-sm text-danger border border-danger/25 bg-danger-soft rounded-2xl py-2.5 hover:bg-danger/15 transition-colors disabled:opacity-50">
                  {leaveBuilding.isPending ? 'Saindo...' : `Sair de ${building.name}`}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: T.faint, fontSize: 14 }}>Você não está vinculado a nenhum prédio.</p>
            <JoinBuildingForm />
          </div>
        )}
      </>
    );
  }

  return (
    <RouteGuard>
      {/* ── DESKTOP ── */}
      <div className="hidden lg:flex" style={{ minHeight: '100vh', background: T.bg }}>
        <BarraLateralDaConta user={user} buildingId={buildingId} />

        <main id={CONTENT_ID} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', maxHeight: '100vh', overflow: 'hidden' }}>
          {/* Sem barra lateral não há como sair nem como voltar: o cabeçalho
              carrega os dois. Com barra, o rodapé dela já faz esse trabalho, e
              repeti-lo aqui seria pôr "Sair" duas vezes na mesma tela. */}
          {!temBarra && (
            <header
              className="anim-fade-down"
              style={{
                height: 60, flexShrink: 0, borderBottom: `1px solid ${T.line}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px',
              }}
            >
              <button
                onClick={() => (isManager(user) && !buildingId ? router.push('/gestor') : router.back())}
                className="btn"
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: T.mute, fontSize: 14, padding: '6px 10px', borderRadius: R.control, '--btn-hover': T.chip }}
              >
                <ArrowLeft size={18} /> Voltar
              </button>
              <Logo size={16} variant="horizontal" />
              <button
                onClick={async () => { await logout(); router.replace('/login'); }}
                className="btn"
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: T.mute, fontSize: 14, padding: '6px 10px', borderRadius: R.control, '--btn-hover': T.chip }}
              >
                <LogOut size={16} /> Sair
              </button>
            </header>
          )}

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '28px 32px 40px' }}>
            <h1 className="anim-fade-down" style={{ color: T.text, fontSize: 22, fontWeight: W.title, marginBottom: 20 }}>
              Configurações da conta
            </h1>

            {/*
              Duas colunas dentro de uma superfície só.

              A largura fixa da esquerda é o que mantém o painel parado ao trocar
              de seção: com `auto`, "Excluir conta" alargaria a coluna e o
              conteúdo inteiro daria um salto lateral a cada clique.
            */}
            <div
              className="anim-fade-up anim-d1"
              style={{
                display: 'grid', gridTemplateColumns: '186px 1fr', gap: 8,
                background: T.card, borderRadius: R.card, boxShadow: T.cardRing,
                padding: 14, maxWidth: 1080,
              }}
            >
              <nav aria-label="Seções da conta" style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 8, borderRight: `1px solid ${T.line}` }}>
                {secoes.map((s) => (
                  <AbaDaConta
                    key={s.id}
                    label={s.label}
                    tone={s.tone}
                    ativa={s.id === secaoAtual.id}
                    onClick={() => trocarSecao(s.id)}
                  />
                ))}
              </nav>

              {/* `key` na seção: cada painel tem os seus campos, e sem isto o
                  React reaproveitaria o de antes — a senha digitada e não salva
                  reapareceria dentro de outra seção. */}
              <div key={secaoAtual.id} className="anim-fade-in" style={{ minWidth: 0, padding: '4px 8px 8px 18px' }}>
                <PainelDaConta
                  secao={secaoAtual.id}
                  user={user}
                  theme={theme}
                  buildingLabel={buildingLabel}
                  onEditarFoto={() => setAvatarModal(true)}
                  onAbrir={setSheet}
                  onExcluir={() => setDeleteModal(true)}
                  BuildingSection={BuildingSection}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── MOBILE ── */}
      <div className="lg:hidden">
        <MPage>
          {/* O mesmo respiro do MTopBar, e vindo de lá: são a primeira linha
              da tela nas duas, e desencontrados um teria o entalhe descontado
              e o outro não. */}
          <div style={{ display: 'flex', alignItems: 'center', padding: `${RESPIRO_TOPO} 0 4px` }}>
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
            <p style={{ color: M.mute, fontSize: 14, marginTop: 4, wordBreak: 'break-all' }}>
              {user?.email}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Tile label="Função" value={roleLabel(user)} />
            <Tile
              label="Prédio"
              value={isManager(user) ? 'Todos os seus' : buildingLabel}
            />
          </div>

          <Group title="Conta" />
          <Row icon={UserRound} label="Identificação" onClick={() => setSheet('identity')} />
          {!isManager(user) && (
            <Row
              icon={Building2}
              label="Prédio"
              hint={buildingLabel}
              onClick={() => setSheet('building')}
            />
          )}

          <Group title="Segurança" />
          <Row icon={KeyRound} label="Alterar senha" onClick={() => setSheet('password')} />

          <Group title="Aparência" />
          {/* As opções à vista, como no desktop: a caixa que as guardava deixou
              de existir, e o tema é justamente a escolha cujo resultado aparece
              atrás dela. */}
          <SeletorDeTema />

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
            <Logo size={13} style={{ color: M.faint }} />
          </div>

          {/* O gestor não tem home nem histórico próprios: a barra não é dele. */}
          {!isManager(user) && <BottomNav />}
        </MPage>
      </div>

      <AvatarEditorModal open={avatarModal} onClose={() => setAvatarModal(false)} />

      {/* As caixas: cada linha da lista abre a sua, no telefone e no computador */}
      <UnsavedScope report={report}>
        <Modal open={sheet === 'identity'} onClose={fecharSheet} title="Identificação" maxWidth={440}>
          <IdentityForm user={user} />
        </Modal>

        <Modal open={sheet === 'password'} onClose={fecharSheet} title="Alterar senha" maxWidth={440}>
          <PasswordForm />
        </Modal>

        <Modal open={sheet === 'feedback'} onClose={fecharSheet} title="Enviar feedback" maxWidth={440}>
          <FeedbackBox />
        </Modal>
      </UnsavedScope>

      <UnsavedChangesModal open={saida.asking} onConfirm={saida.confirm} onCancel={saida.cancel} />


      {/* Chamada como função, não como <BuildingSection />: declarada dentro da
          página, ela seria um tipo novo a cada render e o campo da chave perderia
          o foco a cada tecla. */}
      <Modal open={sheet === 'building'} onClose={() => setSheet(null)} title="Prédio vinculado" maxWidth={440}>
        {BuildingSection()}
      </Modal>

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Excluir conta">
        <p className="text-mute text-sm mb-6">
          Tem certeza? Esta ação é <strong className="text-ink">irreversível</strong>. Seu nome e e-mail serão anonimizados.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteModal(false)}>Cancelar</Button>
          <Button variant="danger" className="flex-1" loading={deleteMe.isPending} onClick={handleDelete}>Confirmar</Button>
        </div>
      </Modal>
    </RouteGuard>
  );
}

export default function PerfilPage() {
  return (
    <Suspense fallback={null}>
      <PerfilContent />
    </Suspense>
  );
}
