'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/app/components/AuthShell';
import { ConfirmarCodigo } from '@/app/components/ConfirmarCodigo';
import { limparEmailPendente, useEmailPendente } from '@/app/lib/emailPendente';
import { T, R } from '@/app/lib/theme';

const S = {
  campo: { display: 'flex', flexDirection: 'column', gap: 6 },
  rotulo: { fontSize: 12, fontWeight: 400, color: T.mute },
  input: {
    background: T.chip, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
    borderRadius: R.control, padding: '13px 16px', color: T.text, fontSize: 16,
    outline: 'none', width: '100%',
  },
  btn: {
    width: '100%', background: T.accent, color: T.onAccent, fontWeight: 500, fontSize: 15,
    padding: '14px', borderRadius: R.control, border: 'none', cursor: 'pointer', marginTop: 4,
  },
  texto: { color: T.mute, fontSize: 14, lineHeight: 1.6 },
};

/**
 * A tela para quem chegou aqui sem vir do cadastro.
 *
 * O caminho comum é o cadastro, que já traz o campo do código na própria tela
 * de sucesso e não passa por aqui. Esta existe para quem tentou entrar e levou
 * o 403 de e-mail não confirmado, e para quem fechou a aba no meio.
 *
 * O endereço vem do `sessionStorage`, e não mais da query string: e-mail em URL
 * fica no histórico do navegador e sai no `Referer`. Quem chega sem ele — outra
 * aba, link colado — digita no campo.
 */
export default function ConfirmarPage() {
  const router = useRouter();
  const guardado = useEmailPendente();
  // O campo começa com o que estiver guardado, e quem chega sem nada digita.
  const [email, setEmail] = useState(guardado);
  const [confirmando, setConfirmando] = useState(false);

  function aoConfirmar() {
    limparEmailPendente();
    router.replace('/login?confirmado=1');
  }

  return (
    <AuthShell
      title="Confirme seu e-mail"
      footer={
        <p style={{ color: T.faint, fontSize: 14 }}>
          <a href="/login" style={{ color: T.accentInk, fontWeight: 500, textDecoration: 'none' }}>
            Voltar para o login
          </a>
        </p>
      }
    >
      {confirmando ? (
        // Sem `senha`, o botão de reenviar não aparece: o endpoint a exige, e
        // quem chega por aqui não a digitou nesta tela. Para reenviar, a pessoa
        // tenta entrar — o login pede a senha e oferece o reenvio ali.
        <ConfirmarCodigo email={email} aoConfirmar={aoConfirmar} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) setConfirmando(true);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <p style={S.texto}>
            Informe o e-mail que você usou no cadastro para digitar o código.
          </p>
          <div style={S.campo}>
            <label htmlFor="email" style={S.rotulo}>E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={S.input}
            />
          </div>
          <button
            type="submit"
            disabled={!email.trim()}
            style={{ ...S.btn, opacity: email.trim() ? 1 : 0.6 }}
          >
            Continuar
          </button>
        </form>
      )}
    </AuthShell>
  );
}
