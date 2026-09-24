import Link from 'next/link';
import { Check } from 'lucide-react';
import { Logo } from '@/app/components/Logo';
import { PLANOS, emReais } from '@/app/lib/planos';
import { T, R, W } from '@/app/lib/theme';

/**
 * A página que explica os planos para quem ainda não tem conta.
 *
 * Existe porque a comparação dentro de `/gestor/cobranca` só alcança quem já
 * entrou — e quem precisa escolher um plano costuma estar do lado de fora. É a
 * única página do produto feita para ser aberta por um link mandado a alguém.
 *
 * Componente de servidor, sem `'use client'`: não há estado nenhum aqui, e o
 * que ela mostra é o mesmo para todo mundo. Isso a deixa ser pré-renderizada,
 * indexada e aberta em um piscar — o oposto do resto do app, que é tela de
 * trabalho atrás de sessão.
 *
 * O preço mensal é o que aparece; o anual vive ao lado, em uma linha. Dois
 * botões de intervalo exigiriam estado e, com ele, cliente — e a diferença que
 * eles mostrariam cabe numa frase.
 */
export const metadata = {
  title: 'Planos',
  description:
    'Os planos do Viston: vistoria predial, chamados de manutenção e relatórios. Comece de graça com um prédio.',
  robots: { index: true, follow: true },
};

const PERGUNTAS = [
  {
    pergunta: 'O plano Livre expira?',
    resposta:
      'Não. Ele comporta um prédio e uma pessoa por papel, e continua assim pelo tempo que você quiser. Não pedimos cartão para começar.',
  },
  {
    pergunta: 'O plano é por prédio ou por conta?',
    resposta:
      'Por conta de gestor. Os prédios que você cadastra entram nela, e o plano cobre todos eles — inclusive as pessoas que trabalham em cada um.',
  },
  {
    pergunta: 'E se eu precisar de mais prédios do que o plano inclui?',
    resposta:
      'O Essencial aceita até 2 prédios extras e o Pro até 20, cobrados por unidade em cima do plano. Você contrata e cancela os extras quando quiser.',
  },
  {
    pergunta: 'Inspetor e responsável pagam?',
    resposta:
      'Não. Quem assina é quem administra o prédio. As contas de quem vistoria, atende chamado ou só acompanha são gratuitas, e no Essencial e no Pro não têm limite de quantidade.',
  },
  {
    pergunta: 'O que acontece se eu cancelar?',
    resposta:
      'A assinatura vale até o fim do período já pago. Depois disso a conta volta ao Livre, e os prédios que passarem do que ele comporta ficam inativos — nada é apagado, e tudo volta assim que você reassinar.',
  },
  {
    pergunta: 'Como é o pagamento?',
    resposta:
      'Cartão de crédito, processado pelo Stripe. Nenhum dado de cartão passa pelo Viston, e a nota de cada cobrança fica disponível na sua conta.',
  },
];

function CartaoDePlano({ plano, destaque }) {
  const mensal = plano.preco.MONTHLY;
  const anual = plano.preco.YEARLY;

  return (
    <div
      style={{
        background: T.card,
        borderRadius: R.card,
        padding: 26,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        border: destaque ? `1px solid ${T.accent}` : `1px solid ${T.line}`,
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontFamily: T.display, fontSize: 19, fontWeight: W.title, color: T.text }}>
            {plano.nome}
          </h2>
          {destaque && (
            <span
              style={{
                fontSize: 11,
                fontWeight: W.title,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: T.accentInk,
                background: T.accentSoft,
                borderRadius: R.badge,
                padding: '3px 9px',
              }}
            >
              Mais escolhido
            </span>
          )}
        </div>
        <p style={{ color: T.mute, fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>{plano.resumo}</p>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: T.display, fontSize: 30, fontWeight: W.title, color: T.text }}>
            {mensal === 0 ? 'Grátis' : emReais(mensal)}
          </span>
          {mensal > 0 && <span style={{ color: T.mute, fontSize: 14 }}>/mês</span>}
        </div>
        {anual > 0 && (
          <p style={{ color: T.mute, fontSize: 13, marginTop: 4 }}>
            ou {emReais(anual)} por ano — dois meses de desconto
          </p>
        )}
      </div>

      <ul style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {[...plano.limites, ...plano.recursos].map((linha) => (
          <li
            key={linha}
            style={{ display: 'flex', gap: 9, alignItems: 'flex-start', color: T.text, fontSize: 14 }}
          >
            <Check size={16} color={T.accent} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <span style={{ lineHeight: 1.5 }}>{linha}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/register/gestor"
        style={{
          marginTop: 'auto',
          textAlign: 'center',
          padding: '11px 0',
          borderRadius: R.control,
          fontFamily: T.display,
          fontSize: 15,
          fontWeight: W.title,
          background: destaque ? T.accent : 'transparent',
          color: destaque ? T.onAccent : T.text,
          border: destaque ? 'none' : `1px solid ${T.line}`,
          boxShadow: destaque ? `inset 0 0 0 1px ${T.accentEdge}` : undefined,
        }}
      >
        {mensal === 0 ? 'Começar de graça' : `Criar conta e assinar`}
      </Link>
    </div>
  );
}

export default function PlanosPage() {
  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '20px 24px',
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        <Link href="/" aria-label="Início do Viston">
          <Logo />
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Link href="/login" style={{ color: T.mute, fontSize: 14 }}>
            Entrar
          </Link>
          <Link
            href="/register/gestor"
            style={{
              background: T.accent,
              color: T.onAccent,
              boxShadow: `inset 0 0 0 1px ${T.accentEdge}`,
              borderRadius: R.control,
              padding: '9px 16px',
              fontFamily: T.display,
              fontSize: 14,
              fontWeight: W.title,
            }}
          >
            Criar conta
          </Link>
        </nav>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 24px 72px' }}>
        <section style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 36px' }}>
          <h1 style={{ fontFamily: T.display, fontSize: 30, fontWeight: W.title, color: T.text, lineHeight: 1.25 }}>
            Um plano por conta, e nenhum por assento
          </h1>
          <p style={{ color: T.mute, fontSize: 16, marginTop: 12, lineHeight: 1.6 }}>
            Quem assina é quem administra o prédio. Inspetor, responsável, moderador e quem só
            acompanha entram sem custo — cobrar por pessoa faria você economizar justamente em quem
            vistoria.
          </p>
        </section>

        <section
          aria-label="Planos"
          style={{
            display: 'grid',
            gap: 18,
            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
            alignItems: 'stretch',
          }}
        >
          {PLANOS.map((plano) => (
            <CartaoDePlano key={plano.code} plano={plano} destaque={plano.code === 'ESSENCIAL'} />
          ))}
        </section>

        <section style={{ marginTop: 56, maxWidth: 760 }}>
          <h2 style={{ fontFamily: T.display, fontSize: 20, fontWeight: W.title, color: T.text }}>
            Perguntas que todo mundo faz
          </h2>

          <dl style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
            {PERGUNTAS.map(({ pergunta, resposta }) => (
              <div key={pergunta}>
                <dt style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text }}>
                  {pergunta}
                </dt>
                <dd style={{ color: T.mute, fontSize: 14, marginTop: 6, lineHeight: 1.65 }}>
                  {resposta}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          style={{
            marginTop: 48,
            background: T.card,
            borderRadius: R.card,
            padding: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ fontFamily: T.display, fontSize: 18, fontWeight: W.title, color: T.text }}>
              Comece pelo primeiro prédio
            </h2>
            <p style={{ color: T.mute, fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
              O Livre não pede cartão. Se a equipe crescer, os planos continuam de onde você parou.
            </p>
          </div>
          <Link
            href="/register/gestor"
            style={{
              background: T.accent,
              color: T.onAccent,
              boxShadow: `inset 0 0 0 1px ${T.accentEdge}`,
              borderRadius: R.control,
              padding: '11px 20px',
              fontFamily: T.display,
              fontSize: 15,
              fontWeight: W.title,
            }}
          >
            Criar conta de gestor
          </Link>
        </section>
      </main>
    </div>
  );
}
