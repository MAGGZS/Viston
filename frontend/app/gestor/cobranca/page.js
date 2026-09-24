'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, CreditCard, ExternalLink } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { GestorHeader } from '@/app/components/GestorHeader';
import { Badge, Button, Card, Skeleton } from '@/app/components/ui';
import { useToastStore } from '@/app/store/toast';
import { useBillingPortal, useCheckout, useMySubscription } from '@/app/hooks/useApi';
import { emReais, nomeDoPlano, PLANOS, STATUS_LABEL } from '@/app/lib/planos';
import { T, R, W } from '@/app/lib/theme';

/**
 * A tela de planos e cobrança do gestor.
 *
 * Uma tela só para as duas coisas de propósito: "o que eu tenho" e "o que eu
 * poderia ter" são a mesma pergunta para quem chega aqui, e separá-las faria a
 * comparação exigir ida e volta.
 *
 * Nada de cartão passa por esta página. Assinar abre o checkout do Stripe;
 * trocar cartão, baixar nota e cancelar abrem o portal dele. É o provedor que
 * cuida do que não deve tocar o nosso servidor.
 */

const INTERVALOS = [
  { id: 'MONTHLY', label: 'Mensal' },
  { id: 'YEARLY', label: 'Anual' },
];

/** O aviso de volta do checkout, lido da URL que o Stripe devolveu. */
function avisoDoCheckout(resultado) {
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

function PlanoAtual({ assinatura, carregando, onPortal, abrindoPortal }) {
  if (carregando) {
    return (
      <Card style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Skeleton style={{ height: 14, width: 120 }} />
        <Skeleton style={{ height: 28, width: 180 }} />
        <Skeleton style={{ height: 14, width: 220 }} />
      </Card>
    );
  }

  const plano = assinatura?.plan ?? 'LIVRE';
  const semAssinatura = !assinatura;

  return (
    <Card style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ color: T.mute, fontSize: 12 }}>Seu plano</p>
          <h2 style={{ fontFamily: T.display, fontSize: 24, fontWeight: W.title, color: T.text, marginTop: 2 }}>
            {nomeDoPlano(plano)}
          </h2>
        </div>

        {!semAssinatura && (
          <Badge variant={assinatura.status === 'ACTIVE' ? 'success' : 'default'}>
            {STATUS_LABEL[assinatura.status] ?? assinatura.status}
          </Badge>
        )}
      </div>

      {semAssinatura ? (
        <p style={{ color: T.mute, fontSize: 14, lineHeight: 1.6 }}>
          O Livre não vence e não cobra nada. Ele comporta um prédio e uma pessoa por papel —
          quando a equipe crescer, os planos abaixo continuam de onde você parou.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, color: T.mute, fontSize: 14 }}>
          {assinatura.extra_buildings > 0 && (
            <span>
              {assinatura.extra_buildings} {assinatura.extra_buildings === 1 ? 'prédio extra' : 'prédios extras'} contratados
            </span>
          )}
          {assinatura.current_period_end && (
            <span>
              {assinatura.cancel_at_period_end ? 'Vale até ' : 'Renova em '}
              {new Date(assinatura.current_period_end).toLocaleDateString('pt-BR')}
            </span>
          )}
          {assinatura.status === 'PAST_DUE' && (
            <span style={{ color: T.text }}>
              A última cobrança falhou. O acesso continua por alguns dias — atualize o cartão no portal.
            </span>
          )}
        </div>
      )}

      {!semAssinatura && (
        <div>
          <Button variant="secondary" loading={abrindoPortal} onClick={onPortal}>
            <CreditCard size={16} style={{ marginRight: 8 }} />
            Cartão, notas e cancelamento
            <ExternalLink size={14} style={{ marginLeft: 8, opacity: 0.7 }} />
          </Button>
        </div>
      )}
    </Card>
  );
}

function CartaoDePlano({ plano, intervalo, atual, onAssinar, assinando }) {
  const preco = plano.preco[intervalo];
  const gratuito = preco === 0;

  return (
    <Card
      style={{
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        border: atual ? `1px solid ${T.accent}` : undefined,
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontFamily: T.display, fontSize: 17, fontWeight: W.title, color: T.text }}>
            {plano.nome}
          </h3>
          {atual && <Badge variant="success">Seu plano</Badge>}
        </div>
        <p style={{ color: T.mute, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{plano.resumo}</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: T.display, fontSize: 26, fontWeight: W.title, color: T.text }}>
          {gratuito ? 'Grátis' : emReais(preco)}
        </span>
        {!gratuito && (
          <span style={{ color: T.mute, fontSize: 13 }}>
            {intervalo === 'MONTHLY' ? '/mês' : '/ano'}
          </span>
        )}
      </div>

      <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...plano.limites, ...plano.recursos].map((linha) => (
          <li key={linha} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: T.text, fontSize: 13 }}>
            <Check size={15} color={T.accent} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <span style={{ lineHeight: 1.5 }}>{linha}</span>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: 'auto' }}>
        {gratuito ? (
          <p style={{ color: T.mute, fontSize: 12 }}>
            {atual ? 'É onde você está.' : 'Disponível para toda conta.'}
          </p>
        ) : (
          <Button
            style={{ width: '100%' }}
            variant={atual ? 'secondary' : 'primary'}
            loading={assinando}
            onClick={() => onAssinar(plano.code)}
          >
            {atual ? 'Mudar contratação' : `Assinar o ${plano.nome}`}
          </Button>
        )}
      </div>
    </Card>
  );
}

function TelaDeCobranca() {
  const searchParams = useSearchParams();
  const aviso = avisoDoCheckout(searchParams?.get('checkout'));

  const { show: toast } = useToastStore();
  const { data: assinatura, isLoading } = useMySubscription();
  const checkout = useCheckout();
  const portal = useBillingPortal();

  const [intervalo, setIntervalo] = useState('MONTHLY');
  const [planoEmCurso, setPlanoEmCurso] = useState(null);

  /**
   * A saída para o Stripe é `window.location`, e não o router do Next: o
   * destino é outro domínio, e a navegação de aplicação não o alcança.
   */
  async function assinar(plan) {
    setPlanoEmCurso(plan);
    try {
      const { url } = await checkout.mutateAsync({ plan, interval: intervalo });
      window.location.href = url;
    } catch (err) {
      setPlanoEmCurso(null);
      toast(err.response?.data?.error?.message ?? 'Não foi possível abrir o pagamento', 'error');
    }
  }

  async function abrirPortal() {
    try {
      const { url } = await portal.mutateAsync();
      window.location.href = url;
    } catch (err) {
      toast(err.response?.data?.error?.message ?? 'Não foi possível abrir o portal', 'error');
    }
  }

  const planoAtual = assinatura?.plan ?? 'LIVRE';

  return (
    <RouteGuard roles={['GESTOR']}>
      <GestorHeader />

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <h1 style={{ fontFamily: T.display, fontSize: 22, fontWeight: W.title, color: T.text }}>
            Planos e cobrança
          </h1>
          <p style={{ color: T.mute, fontSize: 14, marginTop: 4 }}>
            O plano vale para a conta inteira, e cobre os prédios que você criou.
          </p>
        </div>

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

        <PlanoAtual
          assinatura={assinatura}
          carregando={isLoading}
          onPortal={abrirPortal}
          abrindoPortal={portal.isPending}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: T.display, fontSize: 16, fontWeight: W.title, color: T.text }}>
            Comparar planos
          </h2>

          {/* O anual sai mais barato, e é por isso que ele existe aqui: sem a
              escolha visível, a comparação mostraria só um dos dois preços. */}
          <div role="group" aria-label="Intervalo de cobrança" style={{ display: 'flex', gap: 4, background: T.card, borderRadius: R.pill, padding: 4, border: `1px solid ${T.line}` }}>
            {INTERVALOS.map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                onClick={() => setIntervalo(opcao.id)}
                aria-pressed={intervalo === opcao.id}
                style={{
                  padding: '6px 14px',
                  borderRadius: R.pill,
                  fontSize: 13,
                  fontWeight: intervalo === opcao.id ? W.title : 400,
                  color: intervalo === opcao.id ? T.onAccent : T.mute,
                  background: intervalo === opcao.id ? T.accent : 'transparent',
                  cursor: 'pointer',
                }}
              >
                {opcao.label}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            alignItems: 'stretch',
          }}
        >
          {PLANOS.map((plano) => (
            <CartaoDePlano
              key={plano.code}
              plano={plano}
              intervalo={intervalo}
              atual={plano.code === planoAtual}
              assinando={checkout.isPending && planoEmCurso === plano.code}
              onAssinar={assinar}
            />
          ))}
        </div>

        <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.6 }}>
          Prédios extras são contratados no Essencial e no Pro, e cobrados por unidade em cima do
          plano. O pagamento é processado pelo Stripe — nenhum dado de cartão passa pelo Viston.
        </p>
      </main>
    </RouteGuard>
  );
}

export default function CobrancaPage() {
  return (
    // `useSearchParams` — usado para ler a volta do checkout — precisa de uma
    // fronteira de suspensão para a rota continuar sendo pré-renderizada; sem
    // ela o build recusa a página.
    <Suspense fallback={null}>
      <TelaDeCobranca />
    </Suspense>
  );
}
