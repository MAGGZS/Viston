'use client';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Check, Clock, AlertCircle, LogIn, UserPlus, ArrowLeft } from 'lucide-react';
import { Logo } from '@/app/components/Logo';
import { Button, Skeleton } from '@/app/components/ui';
import { Avatar } from '@/app/components/Avatar';
import { useAuthStore } from '@/app/store/auth';
import { useBuildingByKey, useRequestAccess, useMyBuildings, useManagedBuildings } from '@/app/hooks/useApi';
import { roleIn } from '@/app/lib/roles';
import { normalizeShareKey, formatShareKey } from '@/app/lib/shareKey';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

/**
 * Tela de recepção dedicada e personalizada para quem escaneia o QR Code ou clica no link de convite.
 * 
 * Estética matte (fosca), arquitetural e limpa — zero brilhos ou auras artificiais.
 * Garante que o usuário realize login/cadastro antes de solicitar acesso, preservando o convite.
 */
function ConectarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawParam = searchParams?.get('token') || searchParams?.get('codigo') || '';
  const token = normalizeShareKey(rawParam);

  const { user, isAuth } = useAuthStore();
  const { show: toast } = useToastStore();

  const [requested, setRequested] = useState(false);

  // Busca o prédio pelo token informado
  const { data: building, isLoading, error } = useBuildingByKey(token);
  const requestAccess = useRequestAccess();

  // Consulta vínculos existentes da conta
  const { data: myBuildings = [] } = useMyBuildings();
  const { data: managedBuildings = [] } = useManagedBuildings();

  // Papel do usuário se ele já tiver vínculo com este prédio
  const existingRole = useMemo(() => {
    if (!isAuth || !building?.id) return null;
    const authRole = roleIn(user, building.id);
    if (authRole) return authRole;
    const member = Array.isArray(myBuildings) && myBuildings.find((b) => b.building_id === building.id);
    if (member) return member.role;
    const isManager = Array.isArray(managedBuildings) && managedBuildings.some((b) => b.id === building.id);
    if (isManager) return 'GESTOR';
    return null;
  }, [isAuth, building?.id, user, myBuildings, managedBuildings]);

  const isAlreadyLinked = Boolean(existingRole);

  const isExplicitlyExpired = searchParams?.get('expirado') === 'true';
  const isExpired = isExplicitlyExpired || !!error;

  const currentRedirect = token ? `/conectar?token=${encodeURIComponent(token)}` : '/';

  function handleAccessBuilding() {
    if (!building?.id) return;
    if (existingRole === 'GESTOR') {
      router.push(`/gestor/predios/${building.id}`);
    } else if (existingRole === 'RESPONSAVEL') {
      router.push('/responsavel');
    } else if (existingRole === 'MODERADOR') {
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
      {/* Topo com Logo Horizontal Oficial */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'center', color: T.text }}>
        <Logo size={22} variant="horizontal" />
      </div>

      {/* Cartão Central (Matte / Fosco) */}
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: T.card,
          border: `1px solid ${T.line}`,
          borderRadius: 20,
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {/* Caso 1: Convite expirado ou token inexistente */}
        {isExpired ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 20,
                background: T.chip,
                border: `1px solid ${T.line}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Clock size={28} color={T.mute} />
            </div>

            <div>
              <h1 style={{ color: T.text, fontSize: 22, fontWeight: W.title, margin: 0 }}>
                Convite expirado
              </h1>
              <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.5, marginTop: 6, marginBottom: 0 }}>
                Este link de acesso ou QR Code ultrapassou o período de validade e não pode mais ser utilizado.
              </p>
            </div>

            <div
              style={{
                width: '100%',
                background: T.chip,
                border: `1px solid ${T.line}`,
                borderRadius: R.control,
                padding: '14px 16px',
                textAlign: 'left',
                fontSize: 13,
                color: T.mute,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: T.text, display: 'block', marginBottom: 4, fontWeight: W.strong }}>
                Como renovar seu acesso?
              </strong>
              Solicite ao gestor do prédio que abra o compartilhamento e envie um novo link ou aponte sua câmera para o QR Code atualizado na tela dele.
            </div>

            <Button
              variant="primary"
              onClick={() => router.push('/')}
              style={{ width: '100%', padding: '13px', marginTop: 4 }}
            >
              Ir para a tela inicial
            </Button>
          </div>
        ) : !token ? (
          /* Caso 2: Nenhum token informado */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: T.chip,
                border: `1px solid ${T.line}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertCircle size={22} color={T.mute} />
            </div>
            <h1 style={{ color: T.text, fontSize: 18, fontWeight: W.title, margin: 0 }}>
              Código não encontrado
            </h1>
            <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.5, margin: 0 }}>
              Nenhum código de convite foi identificado na URL. Peça o link de convite ou QR Code atualizado ao gestor do prédio.
            </p>
            <Button
              variant="secondary"
              onClick={() => router.push('/')}
              style={{ marginTop: 10, width: '100%' }}
            >
              Ir para o início
            </Button>
          </div>
        ) : isLoading ? (
          /* Caso 3: Carregando dados do prédio */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%', padding: '20px 0' }}>
            <Skeleton style={{ width: 56, height: 56, borderRadius: 16 }} />
            <Skeleton style={{ width: '60%', height: 24, borderRadius: 6 }} />
            <Skeleton style={{ width: '85%', height: 16, borderRadius: 4 }} />
            <Skeleton style={{ width: '100%', height: 44, borderRadius: 10, marginTop: 16 }} />
          </div>
        ) : !isAuth ? (
          /* Caso 4: Não está autenticado -> Exige Login ou Cadastro (sem badge temporário) */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 16 }}>

            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: T.chip,
                border: `1px solid ${T.line}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 4,
              }}
            >
              <Building2 size={26} color={T.text} />
            </div>

            <div>
              <h1 style={{ color: T.text, fontSize: 20, fontWeight: W.title, margin: 0 }}>
                {isLoading ? 'Localizando prédio...' : building?.name || 'Convite para Prédio'}
              </h1>
              {building?.description && (
                <p style={{ color: T.mute, fontSize: 13, marginTop: 4, marginBottom: 0 }}>
                  {building.description}
                </p>
              )}
            </div>

            <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.5, margin: 0, padding: '0 8px' }}>
              Para conectar-se a este prédio e enviar sua solicitação de acesso, faça login na sua conta ou crie uma nova agora.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 8 }}>
              <Button
                onClick={() => router.push(`/login?redirect=${encodeURIComponent(currentRedirect)}`)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px' }}
              >
                <LogIn size={16} />
                Entrar com minha conta
              </Button>

              <Button
                variant="secondary"
                onClick={() => router.push(`/register?redirect=${encodeURIComponent(currentRedirect)}`)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px' }}
              >
                <UserPlus size={16} />
                Criar nova conta
              </Button>
            </div>
          </div>
        ) : requested ? (
          /* Caso 5: Solicitação enviada com sucesso */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Check size={26} color={T.success} />
            </div>

            <h1 style={{ color: T.text, fontSize: 20, fontWeight: W.title, margin: 0 }}>
              Solicitação Enviada!
            </h1>

            <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.5, margin: 0 }}>
              Seu pedido de acesso a <strong style={{ color: T.text }}>{building?.name}</strong> foi encaminhado ao gestor do prédio. Assim que for revisado, o prédio aparecerá no seu painel.
            </p>

            <Button
              onClick={() => router.push('/')}
              style={{ width: '100%', marginTop: 12, padding: '13px' }}
            >
              Acessar Início
            </Button>
          </div>
        ) : (
          /* Caso 6: Usuário autenticado visualizando o prédio com botão de conectar (sem badge) */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 16 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 16,
                background: T.chip,
                border: `1px solid ${T.line}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Building2 size={28} color={T.text} />
            </div>

            <div>
              <h1 style={{ color: T.text, fontSize: 22, fontWeight: W.title, margin: 0 }}>
                {building?.name}
              </h1>
              {building?.description && (
                <p style={{ color: T.mute, fontSize: 13, marginTop: 4, marginBottom: 0 }}>
                  {building.description}
                </p>
              )}
            </div>

            {/* Informações da conta atual solicitante */}
            <div
              style={{
                width: '100%',
                background: T.chip,
                border: `1px solid ${T.line}`,
                borderRadius: R.control,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                textAlign: 'left',
              }}
            >
              <Avatar user={user} size={36} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ color: T.text, fontSize: 13, fontWeight: W.strong, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name}
                </p>
                <p style={{ color: T.mute, fontSize: 11, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email}
                </p>
              </div>
            </div>

            {/* Estado se já tem vínculo vs Solicitar acesso */}
            {isAlreadyLinked ? (
              <>
                <div
                  style={{
                    width: '100%',
                    background: 'rgba(74, 222, 128, 0.08)',
                    border: '1px solid rgba(74, 222, 128, 0.25)',
                    borderRadius: R.control,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    fontSize: 13,
                    color: T.text,
                  }}
                >
                  <Check size={18} color={T.success} style={{ flexShrink: 0 }} />
                  <div>
                    <span style={{ fontWeight: W.strong, display: 'block' }}>Você já possui vínculo</span>
                    <span style={{ color: T.mute, fontSize: 12 }}>
                      {existingRole === 'GESTOR'
                        ? 'Você é gestor deste prédio.'
                        : existingRole === 'RESPONSAVEL'
                        ? 'Você é responsável neste prédio.'
                        : existingRole === 'MODERADOR'
                        ? 'Você é moderador neste prédio.'
                        : 'Você já tem acesso a este prédio como membro.'}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleAccessBuilding}
                  style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: W.strong, marginTop: 4 }}
                >
                  Acessar Prédio
                </Button>
              </>
            ) : (
              <Button
                onClick={handleConfirmRequest}
                loading={requestAccess.isPending}
                style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: W.strong, marginTop: 4 }}
              >
                Solicitar Acesso ao Prédio
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Rodapé discreto */}
      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={() => router.push('/')}
          style={{
            background: 'none',
            border: 'none',
            color: T.faint,
            fontSize: 13,
            cursor: 'pointer',
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
