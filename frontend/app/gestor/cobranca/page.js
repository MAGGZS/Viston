'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, ShieldCheck, ArrowRight } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { GestorHeader } from '@/app/components/GestorHeader';
import { Button, Card, Badge } from '@/app/components/ui';
import { useToastStore } from '@/app/store/toast';
import { useCheckout, useMyPlan, useMySubscription } from '@/app/hooks/useApi';
import { PLANOS, emReais } from '@/app/lib/planos';
import { T, R, W } from '@/app/lib/theme';
import { avisoDoCheckout } from '@/app/components/CobrancaSection';

const INTERVALOS = [
  { id: 'MONTHLY', label: 'Mensal' },
  { id: 'YEARLY', label: 'Anual', desconto: '-17%' },
];

function CobrancaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const aviso = avisoDoCheckout(searchParams?.get('checkout'));

  const { show: toast } = useToastStore();
  const { data: assinatura } = useMySubscription();
  const { data: plano } = useMyPlan();
  const checkout = useCheckout();

  const [intervalo, setIntervalo] = useState('MONTHLY');
  const [planoEmCurso, setPlanoEmCurso] = useState(null);
  const [isMorphingPrice, setIsMorphingPrice] = useState(false);

  const planoAtualCodigo = plano?.code ?? assinatura?.plan ?? 'LIVRE';

  function handleTrocarIntervalo(novoIntervalo) {
    if (novoIntervalo === intervalo) return;
    setIsMorphingPrice(true);
    setTimeout(() => {
      setIntervalo(novoIntervalo);
      setTimeout(() => {
        setIsMorphingPrice(false);
      }, 50);
    }, 90);
  }

  async function assinar(planCode) {
    if (planCode === 'LIVRE') return;
    setPlanoEmCurso(planCode);
    try {
      const { url } = await checkout.mutateAsync({ plan: planCode, interval: intervalo });
      window.location.href = url;
    } catch (err) {
      setPlanoEmCurso(null);
      toast(err.response?.data?.error?.message ?? 'Não foi possível abrir a sessão de pagamento', 'error');
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column' }}>
      <GestorHeader />

      {/* Estilos de animação e micro-interações segundo a skill emil-design-eng */}
      <style>{`
        @keyframes planStaggerEnter {
          0% {
            opacity: 0;
            transform: translateY(12px) scale(0.985);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes planFadeInUp {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .plan-card-interactive {
          transition: transform 220ms cubic-bezier(0.23, 1, 0.32, 1),
                      border-color 220ms cubic-bezier(0.23, 1, 0.32, 1),
                      box-shadow 220ms cubic-bezier(0.23, 1, 0.32, 1);
        }

        @media (hover: hover) and (pointer: fine) {
          .plan-card-interactive:hover {
            transform: translateY(-4px);
            box-shadow: 0 16px 32px -8px rgba(0, 0, 0, 0.45);
          }
        }

        .plan-btn-interactive {
          transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1),
                      opacity 160ms ease-out,
                      background-color 160ms ease-out;
        }

        .plan-btn-interactive:active {
          transform: scale(0.97);
        }

        .plan-price-display {
          transition: filter 160ms cubic-bezier(0.23, 1, 0.32, 1),
                      opacity 160ms cubic-bezier(0.23, 1, 0.32, 1),
                      transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
        }

        .plan-price-display.morphing {
          filter: blur(2px);
          opacity: 0.55;
          transform: scale(0.98);
        }

        @media (prefers-reduced-motion: reduce) {
          .plan-card-interactive,
          .plan-btn-interactive,
          .plan-price-display {
            animation: none !important;
            transition: opacity 150ms ease !important;
            transform: none !important;
          }
        }
      `}</style>

      <main style={{ flex: 1, maxWidth: 1040, width: '100%', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Navegação de retorno */}
        <div style={{ animation: 'planFadeInUp 240ms cubic-bezier(0.23, 1, 0.32, 1) both' }}>
          <Button
            variant="ghost"
            onClick={() => router.push('/perfil?secao=cobranca')}
            className="group plan-btn-interactive"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.mute }}
          >
            <ArrowLeft size={16} className="transition-transform duration-150 group-hover:-translate-x-1" />
            Voltar ao perfil
          </Button>
        </div>

        {/* Notificação de retorno do checkout Stripe */}
        {aviso && (
          <Card
            style={{
              padding: 16,
              borderLeft: `3px solid ${aviso.tom === 'sucesso' ? T.accent : T.line}`,
              color: T.text,
              fontSize: 14,
              lineHeight: 1.6,
              animation: 'planFadeInUp 240ms cubic-bezier(0.23, 1, 0.32, 1) 20ms both',
            }}
          >
            {aviso.texto}
          </Card>
        )}

        {/* Título e apresentação da página */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            animation: 'planFadeInUp 280ms cubic-bezier(0.23, 1, 0.32, 1) 40ms both',
          }}
        >
          <span
            style={{
              color: T.mute,
              fontSize: 11,
              fontWeight: W.strong,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Planos e Assinatura
          </span>
          <h1
            style={{
              fontFamily: T.display,
              fontSize: 28,
              fontWeight: W.title,
              color: T.text,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            Escolha o plano ideal para a sua gestão
          </h1>
          <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.6, maxWidth: 640, margin: 0 }}>
            Cobrança centralizada por conta. Adicione colaboradores ilimitados em todos os papéis a partir
            do plano Essencial, sem surpresas por usuário.
          </p>
        </div>

        {/* Seletor de Intervalo Compacto com Sliding Pill suave */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '6px 0 2px',
            animation: 'planFadeInUp 280ms cubic-bezier(0.23, 1, 0.32, 1) 80ms both',
          }}
        >
          <div
            role="group"
            aria-label="Ciclo de cobrança"
            style={{
              position: 'relative',
              display: 'flex',
              background: T.card,
              borderRadius: R.pill,
              padding: 3,
              border: `1px solid ${T.line}`,
              boxShadow: T.cardRing,
              width: '100%',
              maxWidth: 240,
              height: 35,
            }}
          >
            {/* Sliding Pill animado com curva física iOS-like */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 3,
                bottom: 3,
                left: 3,
                width: 'calc(50% - 3px)',
                borderRadius: R.pill,
                background: T.accent,
                boxShadow: `inset 0 0 0 1px ${T.accentEdge}`,
                transform: intervalo === 'MONTHLY' ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
                pointerEvents: 'none',
              }}
            />

            {INTERVALOS.map((opcao) => {
              const ativo = intervalo === opcao.id;
              return (
                <button
                  key={opcao.id}
                  type="button"
                  onClick={() => handleTrocarIntervalo(opcao.id)}
                  aria-pressed={ativo}
                  className="plan-btn-interactive"
                  style={{
                    flex: 1,
                    position: 'relative',
                    zIndex: 1,
                    padding: '0 8px',
                    borderRadius: R.pill,
                    fontSize: 12,
                    fontWeight: ativo ? W.strong : 400,
                    color: ativo ? T.onAccent : T.mute,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    whiteSpace: 'nowrap',
                    transition: 'color 180ms ease-out',
                  }}
                >
                  <span>{opcao.label}</span>
                  {opcao.desconto && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        lineHeight: 1,
                        padding: '2px 5px',
                        borderRadius: R.pill,
                        background: ativo ? 'rgba(0, 0, 0, 0.16)' : T.accentSoft,
                        color: ativo ? T.onAccent : T.accentInk,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {opcao.desconto}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grade de Planos com Entrada em Cascata (Stagger) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
            alignItems: 'stretch',
          }}
        >
          {PLANOS.map((p, index) => {
            const ehAtual = p.code === planoAtualCodigo;
            const preco = p.preco[intervalo];
            const gratuito = preco === 0;
            const estaAssinando = checkout.isPending && planoEmCurso === p.code;
            const destaque = p.code === 'ESSENCIAL';
            const staggerDelay = 120 + index * 60; // 120ms, 180ms, 240ms

            return (
              <Card
                key={p.code}
                className="plan-card-interactive"
                style={{
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 18,
                  borderRadius: 16,
                  border: ehAtual
                    ? `2px solid ${T.accent}`
                    : destaque
                    ? `1px solid ${T.accentLine}`
                    : `1px solid ${T.line}`,
                  position: 'relative',
                  background: T.card,
                  animation: `planStaggerEnter 320ms cubic-bezier(0.23, 1, 0.32, 1) ${staggerDelay}ms both`,
                }}
              >
                {/* Cabeçalho do Card */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <h2
                      style={{
                        fontFamily: T.display,
                        fontSize: 20,
                        fontWeight: W.title,
                        color: T.text,
                        margin: 0,
                      }}
                    >
                      {p.nome}
                    </h2>
                    {ehAtual ? (
                      <Badge variant="success">Seu plano atual</Badge>
                    ) : destaque ? (
                      <Badge variant="default">Mais popular</Badge>
                    ) : null}
                  </div>
                  <p style={{ color: T.mute, fontSize: 13, marginTop: 6, lineHeight: 1.5, minHeight: 38 }}>
                    {p.resumo}
                  </p>
                </div>

                {/* Preço com Transição de Desfoque Suave (Emil Blur Technique) */}
                <div
                  className={`plan-price-display ${isMorphingPrice ? 'morphing' : ''}`}
                  style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 0' }}
                >
                  <span
                    style={{
                      fontFamily: T.display,
                      fontSize: 32,
                      fontWeight: W.title,
                      color: T.text,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {gratuito ? 'Grátis' : emReais(preco)}
                  </span>
                  {!gratuito && (
                    <span style={{ color: T.mute, fontSize: 13 }}>
                      {intervalo === 'MONTHLY' ? '/ mês' : '/ ano'}
                    </span>
                  )}
                </div>

                {/* Divisor */}
                <div style={{ height: 1, background: T.line }} />

                {/* Lista de Recursos e Limites */}
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    flex: 1,
                  }}
                >
                  {[...p.limites, ...p.recursos].map((linha) => (
                    <li
                      key={linha}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        color: T.text,
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      <Check
                        size={16}
                        color={T.accent}
                        style={{ flexShrink: 0, marginTop: 2 }}
                        aria-hidden="true"
                      />
                      <span>{linha}</span>
                    </li>
                  ))}
                </ul>

                {/* Botão de Ação com Feedback Tátil */}
                <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                  {ehAtual ? (
                    <Button
                      variant="secondary"
                      disabled
                      style={{ width: '100%', opacity: 0.8, cursor: 'default' }}
                    >
                      Plano atual em uso
                    </Button>
                  ) : gratuito ? (
                    <Button
                      variant="secondary"
                      disabled
                      style={{ width: '100%', opacity: 0.7, cursor: 'default' }}
                    >
                      Plano inicial
                    </Button>
                  ) : (
                    <Button
                      variant={destaque ? 'primary' : 'secondary'}
                      className="group plan-btn-interactive"
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                      }}
                      loading={estaAssinando}
                      onClick={() => assinar(p.code)}
                    >
                      <span>Assinar o {p.nome}</span>
                      <ArrowRight size={15} className="transition-transform duration-150 group-hover:translate-x-1" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Rodapé Informativo / Segurança */}
        <div
          style={{
            marginTop: 16,
            padding: '20px 24px',
            borderRadius: R.card,
            background: T.chip,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            animation: 'planFadeInUp 300ms cubic-bezier(0.23, 1, 0.32, 1) 300ms both',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: T.card,
              border: `1px solid ${T.line}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.accent,
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ color: T.text, fontSize: 13, fontWeight: W.strong, margin: 0 }}>
              Pagamento 100% seguro processado pelo Stripe
            </p>
            <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.5, margin: '2px 0 0' }}>
              Nenhum dado de cartão passa pelos nossos servidores. Prédios extras são contratados no
              Essencial e no Pro. Cancele ou mude de plano a qualquer momento sem burocracia.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function CobrancaPage() {
  return (
    <RouteGuard roles={['GESTOR']}>
      <Suspense fallback={<div style={{ minHeight: '100vh', background: T.bg }} />}>
        <CobrancaContent />
      </Suspense>
    </RouteGuard>
  );
}
