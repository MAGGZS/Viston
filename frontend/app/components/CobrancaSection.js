'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, CreditCard, ExternalLink, ChevronRight, Layers, ArrowRight } from 'lucide-react';
import { Badge, Button, Card, Modal, Skeleton } from '@/app/components/ui';
import { useToastStore } from '@/app/store/toast';
import { useBillingPortal, useMyPlan, useMySubscription } from '@/app/hooks/useApi';
import { emReais, nomeDoPlano, PLANOS, STATUS_LABEL } from '@/app/lib/planos';
import { T, R, W } from '@/app/lib/theme';

/** O aviso de volta do checkout, lido da URL que o Stripe devolveu. */
export function avisoDoCheckout(resultado) {
  if (resultado === 'ok') {
    return {
      tom: 'sucesso',
      texto:
        'Pagamento recebido. O plano entra em vigor assim que o provedor confirmar — em geral, alguns segundos.',
    };
  }
  if (resultado === 'cancelado') {
    return { tom: 'aviso', texto: 'Você saiu do pagamento antes de concluir. Nada foi cobrado.' };
  }
  return null;
}

const GB = 1024 ** 3;

/** Espaço em número que se lê: MB abaixo de um décimo de giga, GB acima. */
function emGigas(bytes) {
  if (!bytes) return '0 GB';
  const gigas = bytes / GB;
  return gigas < 0.1 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${gigas.toFixed(1)} GB`;
}

/**
 * O que a conta já gastou do plano.
 */
function Consumo({ plano }) {
  if (!plano) return null;

  const linhas = [
    {
      rotulo: 'Prédios',
      atual: plano.usage.buildings,
      teto: plano.buildings_allowed,
      texto: `${plano.usage.buildings} de ${plano.buildings_allowed}`,
    },
    {
      rotulo: 'Fotos',
      atual: plano.usage.storage_bytes,
      teto: plano.limits.storage_bytes,
      texto: `${emGigas(plano.usage.storage_bytes)} de ${emGigas(plano.limits.storage_bytes)}`,
    },
    {
      rotulo: `E-mails em ${plano.usage.period}`,
      atual: plano.usage.emails_this_month,
      teto: plano.limits.emails_per_month,
      texto: `${plano.usage.emails_this_month} de ${plano.limits.emails_per_month}`,
    },
  ];

  return (
    <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text }}>
        O que você já usou
      </h3>

      {linhas.map(({ rotulo, atual, teto, texto }) => {
        const fracao = teto > 0 ? Math.min(atual / teto, 1) : 0;
        const apertado = fracao >= 0.8;

        return (
          <div key={rotulo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: T.text, fontSize: 13 }}>{rotulo}</span>
              <span style={{ color: apertado ? T.text : T.mute, fontSize: 13 }}>{texto}</span>
            </div>
            <div
              role="progressbar"
              aria-label={rotulo}
              aria-valuenow={Math.round(fracao * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ height: 6, borderRadius: 999, background: T.chip, overflow: 'hidden' }}
            >
              <div
                style={{
                  width: `${fracao * 100}%`,
                  height: '100%',
                  background: apertado ? T.danger : T.accent,
                }}
              />
            </div>
          </div>
        );
      })}

      {linhas.some(({ atual, teto }) => teto > 0 && atual / teto >= 0.8) && (
        <p style={{ color: T.text, fontSize: 13, lineHeight: 1.6 }}>
          Você está perto de um dos limites do plano. Trocar de plano antes evita a recusa no meio
          de uma vistoria.
        </p>
      )}
    </Card>
  );
}

/**
 * Card horizontal do plano atual estilo Spotify ("Seu plano").
 * Clicar nele abre o grande modal de detalhes do plano.
 */
function PlanoAtualHorizontal({ planoCodigo, planoInfo, assinatura, carregando, onClickDetalhes }) {
  if (carregando) {
    return (
      <Card
        style={{
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          borderRadius: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          <Skeleton style={{ height: 16, width: 220 }} />
          <Skeleton style={{ height: 12, width: 260 }} />
        </div>
        <Skeleton style={{ height: 28, width: 100, borderRadius: 999 }} />
      </Card>
    );
  }

  const semAssinatura = !assinatura || planoCodigo === 'LIVRE';
  const preco = planoInfo?.preco?.MONTHLY ?? 0;
  const statusLabel = semAssinatura ? 'Plano gratuito' : (STATUS_LABEL[assinatura?.status] ?? 'Ativa');
  const statusVariant = semAssinatura ? 'default' : (assinatura?.status === 'ACTIVE' ? 'success' : (assinatura?.status === 'PAST_DUE' ? 'danger' : 'default'));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClickDetalhes}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClickDetalhes();
        }
      }}
      aria-label={`Ver detalhes do plano ${planoInfo?.nome ?? 'Livre'}`}
      className="group"
      style={{
        background: T.card,
        borderRadius: 12,
        border: `1px solid ${T.line}`,
        boxShadow: T.cardRing,
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        cursor: 'pointer',
        transition: 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1), border-color 160ms ease-out, box-shadow 160ms ease-out',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = T.accent;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.995)';
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              color: T.mute,
              fontSize: 10,
              fontWeight: W.strong,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            Seu plano
          </span>

          <h3
            style={{
              fontFamily: T.display,
              fontSize: 16,
              fontWeight: W.title,
              color: T.text,
              letterSpacing: '-0.01em',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Viston {planoInfo?.nome ?? 'Livre'}
          </h3>

          <Badge variant={statusVariant} style={{ fontSize: 11, padding: '1px 7px', lineHeight: 1.2 }}>
            {statusLabel}
          </Badge>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', color: T.mute, fontSize: 12, lineHeight: 1.3 }}>
          <span style={{ fontWeight: W.strong, color: T.text }}>
            {semAssinatura ? 'Grátis' : `${emReais(preco)} / mês`}
          </span>

          <span aria-hidden="true" style={{ opacity: 0.4 }}>•</span>

          <span>
            {semAssinatura
              ? 'Acesso contínuo sem expiração'
              : assinatura?.cancel_at_period_end
              ? `Vale até ${new Date(assinatura.current_period_end).toLocaleDateString('pt-BR')}`
              : assinatura?.current_period_end
              ? `Renova em ${new Date(assinatura.current_period_end).toLocaleDateString('pt-BR')}`
              : 'Assinatura ativa'}
          </span>

          {assinatura?.extra_buildings > 0 && (
            <>
              <span aria-hidden="true" style={{ opacity: 0.4 }}>•</span>
              <span>
                {assinatura.extra_buildings} {assinatura.extra_buildings === 1 ? 'prédio extra' : 'prédios extras'}
              </span>
            </>
          )}
        </div>

        {assinatura?.status === 'PAST_DUE' && (
          <p style={{ color: T.danger, fontSize: 11, margin: 0, marginTop: 2 }}>
            A última cobrança falhou. Atualize seu cartão para evitar bloqueio.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <span
          className="group-hover:translate-x-0.5"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 13px',
            borderRadius: R.pill,
            background: T.chip,
            color: T.text,
            fontSize: 12,
            fontWeight: W.strong,
            lineHeight: 1,
            transition: 'transform 180ms ease-out, background 180ms ease-out',
          }}
        >
          Ver detalhes
          <ChevronRight size={14} color={T.mute} />
        </span>
      </div>
    </div>
  );
}

/**
 * Grande modal com os detalhes completos do plano atual.
 */
function ModalDetalhesDoPlano({
  open,
  onClose,
  planoCodigo,
  planoInfo,
  assinatura,
  onUpgrade,
  onPortal,
  abrindoPortal,
}) {
  const semAssinatura = !assinatura || planoCodigo === 'LIVRE';
  const statusLabel = semAssinatura ? 'Plano gratuito' : (STATUS_LABEL[assinatura?.status] ?? 'Ativa');
  const statusVariant = semAssinatura ? 'default' : (assinatura?.status === 'ACTIVE' ? 'success' : (assinatura?.status === 'PAST_DUE' ? 'danger' : 'default'));
  const preco = planoInfo?.preco?.MONTHLY ?? 0;

  const beneficios = [...(planoInfo?.limites ?? []), ...(planoInfo?.recursos ?? [])];

  return (
    <Modal open={open} onClose={onClose} maxWidth={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Cabeçalho do plano */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: T.accentSoft,
                border: `1px solid ${T.accentLine}`,
                color: T.accentInk,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Layers size={20} strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontFamily: T.display, fontSize: 20, fontWeight: W.title, color: T.text, margin: 0 }}>
                  Viston {planoInfo?.nome ?? 'Livre'}
                </h3>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
              </div>
              <p style={{ color: T.mute, fontSize: 13, marginTop: 4 }}>
                {planoInfo?.resumo ?? 'Plano de gestão de vistorias prediais.'}
              </p>
            </div>
          </div>
        </div>

        {/* Bloco de Faturamento / Vigência */}
        <div
          style={{
            background: T.chip,
            borderRadius: R.control,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p style={{ color: T.mute, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: W.strong, margin: 0 }}>
              Valor e cobrança
            </p>
            <p style={{ color: T.text, fontSize: 15, fontWeight: W.title, marginTop: 2, margin: 0 }}>
              {semAssinatura ? 'Gratuito para sempre' : `${emReais(preco)} / mês`}
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <p style={{ color: T.mute, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: W.strong, margin: 0 }}>
              Vigência da conta
            </p>
            <p style={{ color: T.text, fontSize: 13, marginTop: 2, margin: 0 }}>
              {semAssinatura
                ? 'Sem cobrança agendada'
                : assinatura?.cancel_at_period_end
                ? `Cancela em ${new Date(assinatura.current_period_end).toLocaleDateString('pt-BR')}`
                : assinatura?.current_period_end
                ? `Renova em ${new Date(assinatura.current_period_end).toLocaleDateString('pt-BR')}`
                : 'Ativa'}
            </p>
          </div>
        </div>

        {/* Recursos e Benefícios Inclusos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p
            style={{
              color: T.mute,
              fontSize: 11,
              fontWeight: W.strong,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              margin: 0,
            }}
          >
            O que está incluso no seu plano
          </p>

          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {beneficios.map((item) => (
              <li
                key={item}
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
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Ações do Rodapé */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingTop: 12,
            borderTop: `1px solid ${T.line}`,
            flexWrap: 'wrap',
          }}
        >
          {!semAssinatura ? (
            <Button variant="secondary" loading={abrindoPortal} onClick={onPortal}>
              <CreditCard size={15} style={{ marginRight: 6 }} />
              Cartão e notas
              <ExternalLink size={13} style={{ marginLeft: 6, opacity: 0.7 }} />
            </Button>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
            <Button
              variant="primary"
              onClick={onUpgrade}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <span>{planoCodigo === 'PRO' ? 'Ver outros planos' : 'Fazer upgrade de plano'}</span>
              <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function CobrancaSection() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const aviso = avisoDoCheckout(searchParams?.get('checkout'));

  const { show: toast } = useToastStore();
  const { data: assinatura, isLoading } = useMySubscription();
  const { data: plano } = useMyPlan();
  const portal = useBillingPortal();

  const [modalDetalhesAberto, setModalDetalhesAberto] = useState(false);

  const planoAtualCodigo = plano?.code ?? assinatura?.plan ?? 'LIVRE';
  const planoInfo = PLANOS.find((p) => p.code === planoAtualCodigo) || PLANOS[0];

  async function abrirPortal() {
    try {
      const { url } = await portal.mutateAsync();
      window.location.href = url;
    } catch (err) {
      toast(err.response?.data?.error?.message ?? 'Não foi possível abrir o portal', 'error');
    }
  }

  function handleUpgrade() {
    setModalDetalhesAberto(false);
    router.push('/gestor/cobranca');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {aviso && (
        <Card
          style={{
            padding: 16,
            borderLeft: `3px solid ${aviso.tom === 'sucesso' ? T.accent : T.line}`,
            color: T.text,
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          {aviso.texto}
        </Card>
      )}

      {/* Card Horizontal do Plano Estilo Spotify */}
      <PlanoAtualHorizontal
        planoCodigo={planoAtualCodigo}
        planoInfo={planoInfo}
        assinatura={assinatura}
        carregando={isLoading}
        onClickDetalhes={() => setModalDetalhesAberto(true)}
      />

      {/* Consumo atual da conta */}
      <Consumo plano={plano} />

      {/* Grande Modal de Detalhes do Plano */}
      <ModalDetalhesDoPlano
        open={modalDetalhesAberto}
        onClose={() => setModalDetalhesAberto(false)}
        planoCodigo={planoAtualCodigo}
        planoInfo={planoInfo}
        assinatura={assinatura}
        onUpgrade={handleUpgrade}
        onPortal={abrirPortal}
        abrindoPortal={portal.isPending}
      />
    </div>
  );
}
