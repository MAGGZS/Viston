'use client';
import { useEffect, useState } from 'react';
import { CodigoInput } from '@/app/components/CodigoInput';
import { useConfirmEmail, useResendConfirmation } from '@/app/hooks/useApi';
import { T, R } from '@/app/lib/theme';

/** O mesmo intervalo que o backend cobra entre dois pedidos. */
const COOLDOWN_SEG = 60;

const S = {
  btn: {
    width: '100%', background: T.accent, color: T.onAccent, fontWeight: 500, fontSize: 15,
    padding: '14px', borderRadius: R.control, border: 'none', cursor: 'pointer', marginTop: 4,
  },
  btnSecundario: {
    width: '100%', background: 'transparent', color: T.accentInk, fontWeight: 500, fontSize: 14,
    padding: '10px', borderRadius: R.control,
    borderWidth: 1, borderStyle: 'solid', borderColor: T.accentInk, cursor: 'pointer',
  },
  aviso: { background: 'rgba(224,180,0,0.11)', borderRadius: R.control, padding: '11px 14px', textAlign: 'center' },
  erro: { background: 'rgba(248,113,113,0.13)', borderRadius: R.control, padding: '11px 14px', textAlign: 'center' },
  texto: { color: T.mute, fontSize: 14, lineHeight: 1.6 },
};

/**
 * A confirmação do e-mail: digitar o código, e pedir outro se preciso.
 *
 * Fica num componente porque três telas precisam dela — o fim do cadastro comum,
 * o do cadastro de gestor e a tela `/confirmar` de quem chegou pelo login.
 *
 * `senha` é opcional e existe só para o botão de reenviar: o endpoint exige a
 * senha, e quem acabou de se cadastrar já a digitou nesta sessão. Sem ela, o
 * botão não aparece — e é o caso de quem caiu aqui por outro caminho.
 */
export function ConfirmarCodigo({ email, senha, aoConfirmar }) {
  const [codigo, setCodigo] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [reenviado, setReenviado] = useState(false);

  const confirmar = useConfirmEmail();
  const reenvio = useResendConfirmation();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function onSubmit(e) {
    e.preventDefault();
    if (codigo.length !== 6) return;
    try {
      await confirmar.mutateAsync({ email, code: codigo });
      aoConfirmar();
    } catch {
      // A mensagem vem do backend; o `catch` só impede o erro não tratado.
    }
  }

  async function reenviarCodigo() {
    if (cooldown > 0 || !senha) return;
    setCooldown(COOLDOWN_SEG);
    setReenviado(false);
    try {
      await reenvio.mutateAsync({ email, password: senha });
      setReenviado(true);
      // O código antigo morreu no servidor ao emitir o novo: deixar o que a
      // pessoa digitou na tela só a faria mandar um valor que já não vale.
      setCodigo('');
    } catch {
      // Idem.
    }
  }

  const erro = confirmar.error?.response?.data?.error?.message;
  const erroReenvio = reenvio.error?.response?.data?.error?.message;

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={S.texto}>
        Enviamos um código de 6 dígitos para o endereço informado. Ele vale por
        10 minutos.
      </p>

      <CodigoInput valor={codigo} aoMudar={setCodigo} erro={erro} />

      <button
        type="submit"
        disabled={codigo.length !== 6 || confirmar.isPending}
        style={{ ...S.btn, opacity: codigo.length !== 6 || confirmar.isPending ? 0.6 : 1 }}
      >
        {confirmar.isPending ? 'Confirmando...' : 'Confirmar'}
      </button>

      {senha && (
        <div>
          {reenviado ? (
            <div role="status" style={S.aviso}>
              <p style={{ color: T.text, fontSize: 14 }}>
                Enviamos outro código. O anterior deixou de valer.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={reenviarCodigo}
              disabled={cooldown > 0 || reenvio.isPending}
              style={{ ...S.btnSecundario, opacity: cooldown > 0 || reenvio.isPending ? 0.6 : 1 }}
            >
              {cooldown > 0
                ? `Reenviar em ${cooldown}s`
                : reenvio.isPending
                  ? 'Reenviando...'
                  : 'Reenviar código'}
            </button>
          )}
          {erroReenvio && (
            <div role="alert" style={{ ...S.erro, marginTop: 10 }}>
              <p style={{ color: T.danger, fontSize: 14 }}>{erroReenvio}</p>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
