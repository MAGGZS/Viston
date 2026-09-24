'use client';
import { useRouter, usePathname } from 'next/navigation';
import { Layers, Check, ArrowRight, Zap, ShieldCheck } from 'lucide-react';
import { Modal, Button, Badge } from '@/app/components/ui';
import { useUpgradeModalStore } from '@/app/store/upgradeModal';
import { PLANOS, emReais } from '@/app/lib/planos';
import { T, R, W } from '@/app/lib/theme';

export function UpgradeModal() {
  const router = useRouter();
  const pathname = usePathname();
  const { isOpen, errorData, close } = useUpgradeModalStore();

  if (!isOpen) return null;

  const targetCode = errorData?.targetPlan || 'ESSENCIAL';
  const targetPlan = PLANOS.find((p) => p.code === targetCode) || PLANOS[1];

  // Identifica o contexto para personalizar título e explicação
  const message = errorData?.message || '';
  const isBuildingLimit =
    errorData?.code === 'LIMITE_DO_PLANO' &&
    (message.toLowerCase().includes('prédio') || message.toLowerCase().includes('predio'));
  const isModeratorLocked =
    errorData?.code === 'RECURSO_DO_PLANO' ||
    errorData?.feature === 'MODERADOR' ||
    message.toLowerCase().includes('moderador');
  const isTeamLimit =
    message.toLowerCase().includes('papel') ||
    message.toLowerCase().includes('inspetor') ||
    message.toLowerCase().includes('responsável') ||
    message.toLowerCase().includes('responsavel') ||
    message.toLowerCase().includes('colaborador');
  const isFrozen = errorData?.code === 'PREDIO_CONGELADO';

  let title = errorData?.title || 'Faça um upgrade no seu plano';
  let subtitle = message;

  if (isBuildingLimit) {
    title = 'Precisa de mais prédios?';
    subtitle =
      'Você atingiu o limite de prédios do plano atual. Faça o upgrade para cadastrar novos prédios e expandir a sua operação.';
  } else if (isModeratorLocked) {
    title = 'Desbloqueie o papel de Moderador';
    subtitle =
      'A distribuição e moderação de chamados com equipe é um recurso exclusivo a partir do plano Essencial.';
  } else if (isTeamLimit) {
    title = 'Equipe ilimitada para o seu prédio';
    subtitle =
      'No plano Livre o limite é de 1 pessoa por papel. Faça o upgrade para convidar quantos inspetores e responsáveis precisar.';
  } else if (isFrozen) {
    title = 'Reative as operações deste prédio';
    subtitle =
      'Este prédio está inativo por limites do plano. Regularize ou faça o upgrade para retomar novas vistorias e chamados.';
  }

  // Extrai o buildingId da rota se estiver dentro de um prédio
  const matchBuilding = pathname?.match(/\/gestor\/predios\/([^/]+)/);
  const buildingId = matchBuilding ? matchBuilding[1] : null;

  function handleGoToUpgrade() {
    close();
    router.push('/gestor/cobranca');
  }

  const beneficios =
    targetPlan.code === 'PRO'
      ? [
          '5 prédios inclusos (e até 20 extras)',
          'Pessoas ilimitadas em todos os papéis',
          '150 GB de espaço para fotos e vistorias',
          'Marca própria nos relatórios e acesso por API',
        ]
      : [
          'Até 3 prédios cadastrados (1 incluso + 2 extras)',
          'Pessoas ilimitadas em todos os papéis',
          'Moderadores de chamados inclusos',
          '20 GB de espaço para fotos e relatórios CSV',
        ];

  return (
    <Modal open={isOpen} onClose={close} maxWidth={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Cabeçalho com ícone de destaque */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: T.accentSoft,
              border: `1px solid ${T.accentLine}`,
              color: T.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Layers size={22} strokeWidth={2.2} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontFamily: T.display,
                fontWeight: W.title,
                fontSize: 18,
                color: T.text,
                lineHeight: 1.3,
              }}
            >
              {title}
            </h3>
            <p
              style={{
                color: T.mute,
                fontSize: 13,
                lineHeight: 1.5,
                marginTop: 6,
              }}
            >
              {subtitle}
            </p>
          </div>
        </div>

        {/* Card do Plano Recomendado */}
        <div
          style={{
            background: T.chip,
            border: `1px solid ${T.accent}`,
            borderRadius: R.card,
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <span style={{ color: T.mute, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Recomendado
              </span>
              <h4
                style={{
                  fontFamily: T.display,
                  fontWeight: W.title,
                  fontSize: 17,
                  color: T.text,
                  marginTop: 2,
                }}
              >
                Plano {targetPlan.nome}
              </h4>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontFamily: T.display,
                  fontWeight: W.title,
                  fontSize: 20,
                  color: T.text,
                }}
              >
                {emReais(targetPlan.preco.MONTHLY)}
              </span>
              <span style={{ color: T.mute, fontSize: 12 }}>/mês</span>
            </div>
          </div>

          <div style={{ height: 1, background: T.line }} />

          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {beneficios.map((b) => (
              <li
                key={b}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  color: T.text,
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
              >
                <Check size={15} color={T.accent} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          <Button
            variant="primary"
            onClick={handleGoToUpgrade}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            Ver planos e fazer upgrade
            <ArrowRight size={16} />
          </Button>

          <Button variant="ghost" onClick={close} style={{ width: '100%', color: T.mute }}>
            Continuar no plano atual
          </Button>
        </div>
      </div>
    </Modal>
  );
}
