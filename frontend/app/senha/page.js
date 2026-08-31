'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/app/components/AuthShell';
import { useForgotPassword } from '@/app/hooks/useApi';
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
  erro: { background: 'rgba(248,113,113,0.13)', borderRadius: R.control, padding: '11px 14px', textAlign: 'center' },
  texto: { color: T.mute, fontSize: 14, lineHeight: 1.6 },
};

/**
 * Esqueci minha senha: o pedido do código.
 *
 * A tela não olha a resposta para decidir nada, e não tem como olhar: o backend
 * responde a mesma coisa para endereço com conta e sem conta. Qualquer ramo
 * aqui — uma mensagem diferente, um caminho diferente — desfaria do lado de cá
 * o cuidado que o outro lado teve, e o formulário viraria um verificador de
 * quais e-mails estão cadastrados.
 */
export default function EsqueciSenhaPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const esqueci = useForgotPassword();

  async function onSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await esqueci.mutateAsync(email.trim());
      // O e-mail vai na URL da próxima tela porque ela precisa dele para o
      // código, e é o endereço da própria pessoa, digitado por ela agora. O
      // que nunca entra em URL é o código.
      router.push(`/senha/nova?email=${encodeURIComponent(email.trim())}`);
    } catch {
      // Erro real de rede ou de limite; a mensagem vem do backend.
    }
  }

  const erro = esqueci.error?.response?.data?.error?.message;

  return (
    <AuthShell
      title="Esqueci minha senha"
      subtitle="Enviamos um código para o seu e-mail. Com ele, você escolhe uma senha nova."
      footer={
        <p style={{ color: T.faint, fontSize: 14 }}>
          Lembrou?{' '}
          <a href="/login" style={{ color: T.accentInk, fontWeight: 500, textDecoration: 'none' }}>
            Entrar
          </a>
        </p>
      }
    >
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

        {erro && (
          <div role="alert" style={S.erro}>
            <p style={{ color: T.danger, fontSize: 14 }}>{erro}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!email.trim() || esqueci.isPending}
          style={{ ...S.btn, opacity: !email.trim() || esqueci.isPending ? 0.6 : 1 }}
        >
          {esqueci.isPending ? 'Enviando...' : 'Enviar código'}
        </button>
      </form>
    </AuthShell>
  );
}
