'use client';
import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button, Card } from '@/app/components/ui';
import { useToastStore } from '@/app/store/toast';
import { useOwnershipTransfers, useRespondTransfer } from '@/app/hooks/useApi';
import { detalheDoLimite, ehErroDePlano, mensagemDoErro } from '@/app/lib/erros';
import { T, R, W } from '@/app/lib/theme';

/**
 * Os prédios que estão sendo passados para esta conta.
 *
 * Aparece no alto da tela de prédios porque é a única coisa ali que tem prazo:
 * sete dias sem resposta e o prédio é inativado — o que penaliza quem ofereceu,
 * não quem recebeu, e por isso a decisão não pode ficar escondida atrás de um
 * menu.
 *
 * Nada é mostrado quando não há convite: um bloco vazio dizendo "nenhum
 * convite" ocuparia o lugar do que a pessoa veio fazer.
 */
export function ConvitesDeTransferencia() {
  const { show: toast } = useToastStore();
  const { data: convites = [] } = useOwnershipTransfers();
  const responder = useRespondTransfer();
  const [emCurso, setEmCurso] = useState(null);

  if (convites.length === 0) return null;

  async function responderConvite(id, accept) {
    setEmCurso(`${id}:${accept}`);
    try {
      await responder.mutateAsync({ id, accept });
      toast(
        accept ? 'Prédio transferido para a sua conta' : 'Convite recusado',
        accept ? 'success' : 'info'
      );
    } catch (err) {
      if (ehErroDePlano(err)) {
        const detalhe = detalheDoLimite(err);
        toast(
          mensagemDoErro(err),
          'error',
          detalhe
            ? `${detalhe} O convite continua de pé — veja Planos e cobrança.`
            : 'O convite continua de pé — veja Planos e cobrança.'
        );
      } else {
        toast(mensagemDoErro(err), 'error');
      }
    } finally {
      setEmCurso(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 680 }}>
      {convites.map((convite) => {
        const prazo = new Date(convite.expires_at).toLocaleDateString('pt-BR');

        return (
          <Card
            key={convite.id}
            className="anim-fade-up"
            style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, borderLeft: `3px solid ${T.accent}` }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 36, height: 36, borderRadius: R.card, background: T.accentSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <Building2 size={18} color={T.accent} />
              </span>

              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text }}>
                  {convite.from_manager?.name ?? 'Outro gestor'} quer passar {convite.building?.name ?? 'um prédio'} para você
                </p>
                <p style={{ color: T.mute, fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>
                  Aceitar traz o prédio — e a cobrança dele — para a sua conta. Sem resposta até{' '}
                  {prazo}, o prédio é inativado e só o suporte reativa.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button
                loading={emCurso === `${convite.id}:true`}
                onClick={() => responderConvite(convite.id, true)}
              >
                Aceitar o prédio
              </Button>
              <Button
                variant="secondary"
                loading={emCurso === `${convite.id}:false`}
                onClick={() => responderConvite(convite.id, false)}
              >
                Recusar
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
