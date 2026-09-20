'use client';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Check, Clock, AlertCircle, LogIn, ArrowLeft, LogOut } from 'lucide-react';
import { Logo } from '@/app/components/Logo';
import { Button, Skeleton } from '@/app/components/ui';
import { Avatar } from '@/app/components/Avatar';
import { useAuthStore } from '@/app/store/auth';
import { useBuildingByKey, useRequestAccess, useMyBuildings, useManagedBuildings } from '@/app/hooks/useApi';
import { roleIn, buildingRoleLabel } from '@/app/lib/roles';
import { normalizeShareKey } from '@/app/lib/shareKey';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

/**
 * Tela de recepção dedicada e personalizada para quem escaneia o QR Code ou clica no link de convite.
 * 
 * Estética matte (fosca), arquitetural e limpa — zero brilhos ou auras artificiais.
 * Garante que o usuário realize login/cadastro antes de solicitar acesso, preservando o convite.
 * Se o usuário já possuir vínculo com este ou outro prédio, exibe a tela dedicada 'Você já possui vínculo a um prédio'.
 */
function ConectarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawParam = searchParams?.get('token') || searchParams?.get('codigo') || '';
  const token = normalizeShareKey(rawParam);

  // `isAuth` não existe no store — ele guarda `user`, e ter conta carregada é o
  // que significa estar autenticado. Desestruturá-lo dava `undefined`: a tela
  // se achava deslogada o tempo todo, e os casos de "já possui vínculo" e
  // "solicitar acesso" nunca chegavam a aparecer, nem para quem tinha sessão.
  const { user, isLoading: carregandoSessao, logout } = useAuthStore();
  const isAuth = !!user;
  const { show: toast } = useToastStore();

  const [requested, setRequested] = useState(false);

  // Busca o prédio pelo token informado
  const { data: building, isLoading, error } = useBuildingByKey(token);
  const requestAccess = useRequestAccess();

  // Consulta vínculos existentes da conta. As duas só saem com sessão: sem
  // conta, elas voltariam 401 e o interceptor encerraria a sessão — ver a nota
  // em `useMyBuildings`.
  const { data: myBuildings = [], isLoading: loadingMy } = useMyBuildings(isAuth);
  const { data: managedBuildings = [], isLoading: loadingManaged } = useManagedBuildings(isAuth);

  // Procura vínculos da conta (com o prédio atual do token ou com outro prédio qualquer)
  const existingAffiliation = useMemo(() => {
    if (!isAuth) return null;

    // 1. Vínculo direto com este prédio específico (pelo token)
    if (building?.id) {
      const authRole = roleIn(user, building.id);
      if (authRole) {
        return {
          id: building.id,
          name: building.name,
          role: authRole,
          isCurrent: true,
        };
      }
      const member = Array.isArray(myBuildings) && myBuildings.find((b) => b.building_id === building.id);
      if (member) {
        return {
          id: building.id,
          name: member.name || building.name,
          role: member.role,
          isCurrent: true,
        };
      }
      const isManager = Array.isArray(managedBuildings) && managedBuildings.some((b) => b.id === building.id);
      if (isManager) {
        return {
          id: building.id,
          name: building.name,
          role: 'GESTOR',
          isCurrent: true,
        };
      }
    }

    // 2. Vínculo com outro prédio qualquer
    if (Array.isArray(myBuildings) && myBuildings.length > 0) {
      const first = myBuildings[0];
      return {
        id: first.building_id,
        name: first.name || 'Prédio Vinculado',
        role: first.role,
        isCurrent: false,
      };
    }
    if (Array.isArray(managedBuildings) && managedBuildings.length > 0) {
      const first = managedBuildings[0];
      return {
        id: first.id,
        name: first.name || 'Prédio Vinculado',
        role: 'GESTOR',
        isCurrent: false,
      };
    }
    if (Array.isArray(user?.memberships) && user.memberships.length > 0) {
      const first = user.memberships[0];
      return {
        id: first.building_id,
        name: first.name || first.building_name || 'Prédio Vinculado',
        role: first.role,
        isCurrent: false,
      };
    }

    return null;
    // `building` inteiro, e não `building?.id` e `building?.name` soltos: o
    // compilador do React lê as dependências que o corpo de fato usa e não
    // reconhece campo alcançado por `?.` na lista, então a memoização escrita à
    // mão era descartada — o componente perdia a otimização inteira. O objeto
    // vem do cache da consulta e só troca de identidade quando o prédio muda,
    // que é exatamente quando este cálculo precisa refazer.
  }, [isAuth, building, user, myBuildings, managedBuildings]);

  const isExplicitlyExpired = searchParams?.get('expirado') === 'true';
  const isExpired = isExplicitlyExpired || !!error;

  const currentRedirect = token ? `/conectar?token=${encodeURIComponent(token)}` : '/';

  // Se ainda estiver carregando informações básicas.
  //
  // `carregandoSessao` entra primeiro: no carregamento da página o `/auth/me`
  // ainda está no ar e `user` é nulo. Sem esperá-lo, quem tem sessão via a tela
  // de "faça login" piscar antes de a conta chegar.
  const isDataLoading =
    carregandoSessao || isLoading || (isAuth && (loadingMy || loadingManaged) && !existingAffiliation);

  function handleAccessExisting(affiliation) {
    if (!affiliation) {
      router.push('/');
      return;
    }
    const role = affiliation.role;
    if (role === 'GESTOR') {
      router.push(affiliation.id ? `/gestor/predios/${affiliation.id}` : '/gestor');
    } else if (role === 'RESPONSAVEL') {
      router.push('/responsavel');
    } else if (role === 'MODERADOR') {
      router.push('/moderador');
    } else {
      router.push('/home');
    }
  }

  async function handleConfirmRequest() {
    if (!token) return;
    try {
      await requestAccess.mutateAsync(token);
      setRequested(true);
      toast('Solicitação enviada com sucesso!', 'success');
    } catch (e) {
      if (e?.response?.status === 409) {
        toast('Você já possui vínculo com este prédio!', 'info');
      } else {
        toast(e?.response?.data?.error?.message || 'Erro ao solicitar acesso', 'error');
      }
    }
  }

  async function handleSwitchAccount() {
    await logout();
    router.push(`/login?redirect=${encodeURIComponent(currentRedirect)}`);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      {/* Topo com Logo Horizontal Oficial (ampliada) */}
      <div className="anim-fade-up" style={{ marginBottom: 32, display: 'flex', justifyContent: 'center', color: T.text }}>
        <Logo size={32} variant="horizontal" />
      </div>

      {/* Coluna central, sem cartão: a mesma casca chapada das telas de acesso */}
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {/* Caso 1: Convite expirado ou token inexistente */}
        {isExpired ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%' }}>
            <Clock className="anim-fade-up" size={46} color={T.mute} strokeWidth={1.75} />

            <div className="anim-fade-up anim-d1">
              <h1 style={{ color: T.text, fontSize: 22, fontWeight: W.title, margin: '6px 0 0' }}>
                Convite expirado
              </h1>
              <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.5, marginTop: 8, marginBottom: 0 }}>
                Este link de acesso ou QR Code ultrapassou o período de validade e não pode mais ser utilizado.
              </p>
            </div>

            <Button
              className="anim-fade-up anim-d3"
              variant="primary"
              onClick={() => router.push('/')}
              style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: W.strong, marginTop: 10 }}
            >
              Ir para a tela inicial
            </Button>
          </div>
        ) : !token ? (
          /* Caso 2: Nenhum token informado */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%' }}>
            <AlertCircle className="anim-fade-up" size={46} color={T.mute} strokeWidth={1.75} />

            <div className="anim-fade-up anim-d1">
              <h1 style={{ color: T.text, fontSize: 20, fontWeight: W.title, margin: '6px 0 0' }}>
                Código não encontrado
              </h1>
              <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.5, marginTop: 8, marginBottom: 0 }}>
                Nenhum código de convite foi identificado na URL. Peça o link de convite ou QR Code atualizado ao gestor do prédio.
              </p>
            </div>

            {/* Ação única da tela, então ela é a de peso — antes era cinza. */}
            <Button
              className="anim-fade-up anim-d3"
              onClick={() => router.push('/')}
              style={{ marginTop: 10, width: '100%', padding: '14px', fontSize: 15, fontWeight: W.strong }}
            >
              Ir para o início
            </Button>
          </div>
        ) : isDataLoading ? (
          /* Caso 3: Carregando dados */
          <div className="anim-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', padding: '20px 0' }}>
            <Skeleton style={{ width: 48, height: 48, borderRadius: 12 }} />
            <Skeleton style={{ width: '60%', height: 24, borderRadius: 6 }} />
            <Skeleton style={{ width: '85%', height: 16, borderRadius: 4 }} />
            <Skeleton style={{ width: '100%', height: 44, borderRadius: 10, marginTop: 16 }} />
          </div>
        ) : !isAuth ? (
          /* Caso 4: Não está autenticado -> Exige Login ou Cadastro */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 16 }}>
            <Building2 className="anim-fade-up" size={46} color={T.text} strokeWidth={1.75} />

            <div className="anim-fade-up anim-d1">
              <h1 style={{ color: T.text, fontSize: 22, fontWeight: W.title, margin: '4px 0 0' }}>
                {building?.name || 'Convite para Prédio'}
              </h1>
              {building?.description && (
                <p style={{ color: T.mute, fontSize: 13, marginTop: 6, marginBottom: 0 }}>
                  {building.description}
                </p>
              )}
            </div>

            <p className="anim-fade-up anim-d2" style={{ color: T.mute, fontSize: 14, lineHeight: 1.5, margin: 0, padding: '0 6px' }}>
              Para conectar-se a este prédio e enviar sua solicitação de acesso, faça login na sua conta ou crie uma nova agora.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', marginTop: 8 }}>
              <Button
                className="anim-fade-up anim-d3"
                onClick={() => router.push(`/login?redirect=${encodeURIComponent(currentRedirect)}`)}
                style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: W.strong }}
              >
                <LogIn size={16} />
                Entrar com minha conta
              </Button>

              {/* Segunda via em texto, como no rodapé do login: uma ação de peso
                  por tela — quem já tem conta entra, quem não tem lê o convite. */}
              <p className="anim-fade-up anim-d4" style={{ color: T.faint, fontSize: 14, margin: 0 }}>
                Não tem conta?{' '}
                <a
                  className="link-acao link-acao--acento"
                  href={`/register?redirect=${encodeURIComponent(currentRedirect)}`}
                  style={{ color: T.accentInk, fontWeight: W.strong }}
                >
                  Criar conta
                </a>
              </p>
            </div>
          </div>
        ) : requested ? (
          /* Caso 5: Solicitação enviada com sucesso */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%' }}>
            {/* `pop-in`, e não `fade-up`: é a única tela que confirma algo que a
                pessoa acabou de fazer, e a marca chega respondendo ao toque. */}
            <Check className="anim-pop-in" size={48} color={T.success} strokeWidth={2.5} />

            <div className="anim-fade-up anim-d1">
              <h1 style={{ color: T.text, fontSize: 22, fontWeight: W.title, margin: '6px 0 0' }}>
                Solicitação Enviada!
              </h1>
              <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.5, marginTop: 8, marginBottom: 0 }}>
                Seu pedido de acesso a <strong style={{ color: T.text }}>{building?.name}</strong> foi encaminhado ao gestor do prédio. Assim que for revisado, o prédio aparecerá no seu painel.
              </p>
            </div>

            <Button
              className="anim-fade-up anim-d3"
              onClick={() => router.push('/')}
              style={{ width: '100%', marginTop: 12, padding: '14px', fontSize: 15, fontWeight: W.strong }}
            >
              Acessar Início
            </Button>
          </div>
        ) : existingAffiliation ? (
          /* Caso 6: Usuário já possui vínculo a este ou outro prédio */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 16 }}>
            <Building2 className="anim-fade-up" size={48} color={T.text} strokeWidth={1.75} />

            {/* Título e Texto Explicativo */}
            <div className="anim-fade-up anim-d1">
              <h1 style={{ color: T.text, fontSize: 22, fontWeight: W.title, margin: '4px 0 0' }}>
                {existingAffiliation.isCurrent
                  ? 'Você já possui vínculo com este prédio'
                  : 'Você já possui vínculo a um prédio'}
              </h1>
              <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.5, marginTop: 8, marginBottom: 0, padding: '0 4px' }}>
                {existingAffiliation.isCurrent
                  ? `Sua conta já possui acesso autorizado a ${building?.name || 'este prédio'}. Não é necessário solicitar acesso novamente.`
                  : `Sua conta já está associada ao condomínio ${existingAffiliation.name}. Cada conta possui acesso ao seu respectivo condomínio.`}
              </p>
            </div>

            {/* Detalhes do Vínculo Atual (sem caixa cinza, apenas texto limpo) */}
            <div
              className="anim-fade-up anim-d2"
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: '8px 0',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 11, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: W.strong, display: 'block' }}>
                    {existingAffiliation.isCurrent ? 'Prédio Conectado' : 'Seu Prédio Atual'}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: W.strong, color: T.text, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {existingAffiliation.name}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: W.strong,
                    color: T.success,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {buildingRoleLabel(existingAffiliation.role)}
                </span>
              </div>

              <div style={{ height: 1, background: T.line, width: '100%' }} />

              {/* Informações da Conta */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar user={user} size={34} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: T.text, fontSize: 13, fontWeight: W.strong, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.name}
                  </p>
                  <p style={{ color: T.mute, fontSize: 12, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.email}
                  </p>
                </div>
              </div>
            </div>

            {/* Ações: uma de peso, e as saídas em texto abaixo dela. */}
            <div className="anim-fade-up anim-d3" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
              <Button
                onClick={() => handleAccessExisting(existingAffiliation)}
                style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: W.strong }}
              >
                {existingAffiliation.isCurrent ? 'Acessar Prédio' : 'Acessar meu prédio atual'}
              </Button>

              <button
                type="button"
                className="link-acao link-acao--acento"
                onClick={() => router.push('/')}
                style={{ color: T.accentInk, fontSize: 14, fontWeight: W.strong }}
              >
                Ir para o início
              </button>
            </div>

            {/* Opção para alternar de conta */}
            <button
              type="button"
              className="link-acao anim-fade-up anim-d4"
              onClick={handleSwitchAccount}
              style={{
                color: T.faint,
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                marginTop: 2,
              }}
            >
              <LogOut size={12} />
              Entrar com outra conta
            </button>
          </div>
        ) : (
          /* Caso 7: Usuário autenticado sem nenhum vínculo -> Solicitar Acesso */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 16 }}>
            <Building2 className="anim-fade-up" size={48} color={T.text} strokeWidth={1.75} />

            <div className="anim-fade-up anim-d1">
              <h1 style={{ color: T.text, fontSize: 22, fontWeight: W.title, margin: '4px 0 0' }}>
                {building?.name}
              </h1>
              {building?.description && (
                <p style={{ color: T.mute, fontSize: 13, marginTop: 6, marginBottom: 0 }}>
                  {building.description}
                </p>
              )}
            </div>

            {/* Informações da conta atual solicitante (sem caixa cinza, apenas o texto) */}
            <div
              className="anim-fade-up anim-d2"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                textAlign: 'left',
                padding: '4px 0',
              }}
            >
              <Avatar user={user} size={36} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ color: T.text, fontSize: 13, fontWeight: W.strong, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name}
                </p>
                <p style={{ color: T.mute, fontSize: 12, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email}
                </p>
              </div>
            </div>

            <Button
              className="anim-fade-up anim-d3"
              onClick={handleConfirmRequest}
              loading={requestAccess.isPending}
              style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: W.strong, marginTop: 4 }}
            >
              Solicitar Acesso ao Prédio
            </Button>
          </div>
        )}
      </div>

      {/* Rodapé discreto */}
      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          className="link-acao anim-fade-up anim-d5"
          onClick={() => router.push('/')}
          style={{
            color: T.faint,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <ArrowLeft size={14} />
          Voltar para o Viston
        </button>
      </div>
    </div>
  );
}

export default function ConectarPage() {
  return (
    <Suspense fallback={null}>
      <ConectarContent />
    </Suspense>
  );
}

