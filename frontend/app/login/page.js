'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/app/components/AuthShell';
import { useAuthStore } from '@/app/store/auth';
import { T, R } from '@/app/lib/theme';
import { useLogin, useResendConfirmation } from '@/app/hooks/useApi';
import { guardarEmailPendente } from '@/app/lib/emailPendente';

const schema = yup.object({
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
  password: yup.string().min(1, 'Obrigatório').required('Obrigatório'),
});

const S = {
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 400, color: T.mute },
  input: { background: T.chip, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', borderRadius: R.control, padding: '13px 16px', color: T.text, fontSize: 16, outline: 'none', width: '100%' },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  eyeBtn: { position: 'absolute', right: 6, background: 'none', border: 'none', padding: 8, cursor: 'pointer', color: T.mute, display: 'flex', alignItems: 'center' },
  btn: { width: '100%', background: T.accent, color: T.onAccent, fontWeight: 500, fontSize: 15, padding: '14px', borderRadius: R.control, border: 'none', cursor: 'pointer', marginTop: 4 },
  errBox: { background: 'rgba(248,113,113,0.13)', borderRadius: R.control, padding: '11px 14px', textAlign: 'center' },
  // E-mail não confirmado não é erro: é um passo pendente. Por isso o aviso usa
  // o dourado da marca, e não o vermelho do `errBox` — o que falta aqui tem
  // botão, não culpa.
  avisoBox: { background: 'rgba(224,180,0,0.11)', borderRadius: R.control, padding: '13px 14px', textAlign: 'center' },
  btnSecundario: {
    width: '100%', background: 'transparent', color: T.accentInk, fontWeight: 500, fontSize: 14,
    padding: '10px', marginTop: 10, borderRadius: R.control,
    borderWidth: 1, borderStyle: 'solid', borderColor: T.accentInk, cursor: 'pointer',
  },
  footer: { color: T.faint, fontSize: 14 },
  link: { color: T.accentInk, fontWeight: 500, textDecoration: 'none' },
};

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const { mutateAsync, isPending, error } = useLogin();
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: yupResolver(schema) });
  const [showPassword, setShowPassword] = useState(false);

  // As credenciais da última tentativa, guardadas para o reenvio.
  //
  // O endpoint de reenvio exige a senha, e pedi-la de novo numa segunda caixa
  // seria pedir duas vezes a mesma coisa na mesma tela. Vive só em memória, e
  // some quando a aba fecha.
  const [ultimaTentativa, setUltimaTentativa] = useState(null);
  const [segundosAteReenviar, setSegundosAteReenviar] = useState(0);
  const [reenviado, setReenviado] = useState(false);
  const reenvio = useResendConfirmation();

  async function onSubmit(data) {
    setUltimaTentativa(data);
    setReenviado(false);
    try {
      const res = await mutateAsync(data);
      login(res.access_token, res.refresh_token, res.user);
      router.replace('/');
    } catch {}
  }

  // O cooldown de 60s do botão de reenviar. O backend tem o teto próprio dele
  // (cinco por hora, por endereço); isto é para a mão, não para o servidor.
  useEffect(() => {
    if (segundosAteReenviar <= 0) return;
    const t = setTimeout(() => setSegundosAteReenviar((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [segundosAteReenviar]);

  async function reenviarConfirmacao() {
    if (!ultimaTentativa || segundosAteReenviar > 0) return;
    setSegundosAteReenviar(60);
    try {
      await reenvio.mutateAsync(ultimaTentativa);
      setReenviado(true);
    } catch {}
  }

  const codigo = error?.response?.data?.error?.code;
  const apiError = error?.response?.data?.error?.message;

  // Conta que existe, senha certa, e-mail não confirmado. Não é erro de quem
  // digitou: é um passo que ficou para trás, e o que a tela deve oferecer é o
  // caminho de volta a ele — não uma mensagem vermelha.
  const naoConfirmado = codigo === 'EMAIL_NAO_CONFIRMADO';

  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesse as vistorias do prédio em que você trabalha."
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={S.footer}>Não tem conta?{' '}<a href="/register" style={S.link}>Criar conta</a></p>
          <p style={S.footer}>
            Vai administrar um prédio?{' '}
            <a href="/register/gestor" style={S.link}>Cadastre-se como gestor</a>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={S.field}>
          {/* `htmlFor` de verdade: `<label>` solto não nomeia campo nenhum, e o
              leitor de tela anunciava só "caixa de edição". O erro vira `alert`
              e é apontado pelo campo — sem isso ele aparecia em silêncio. */}
          <label htmlFor="email" style={S.label}>E-mail</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="seu@email.com"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-erro' : undefined}
            style={{ ...S.input, ...(errors.email ? { borderColor: 'rgba(248,113,113,0.5)' } : {}) }}
            {...register('email')}
          />
          {errors.email && <span id="email-erro" role="alert" style={{ fontSize: 12, color: T.danger }}>{errors.email.message}</span>}
        </div>
        <div style={S.field}>
          <label htmlFor="senha" style={S.label}>Senha</label>
          <div style={S.inputWrap}>
            <input
              id="senha"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'senha-erro' : undefined}
              style={{ ...S.input, paddingRight: 46, ...(errors.password ? { borderColor: 'rgba(248,113,113,0.5)' } : {}) }}
              {...register('password')}
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} style={S.eyeBtn}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {errors.password && <span id="senha-erro" role="alert" style={{ fontSize: 12, color: T.danger }}>{errors.password.message}</span>}
          {/*
            O link mora colado ao campo, e não no rodapé com os de cadastro.
            Quem esquece a senha descobre isso olhando para a caixa da senha —
            é ali que a saída precisa estar, e não três linhas abaixo, no meio
            de convites para criar conta.

            Alinhado à direita e menor que o rótulo: é uma saída, não um passo
            do formulário, e competir com o botão de entrar seria oferecer o
            desvio antes da estrada.
          */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
            <a href="/senha" style={{ ...S.link, fontSize: 13 }}>Esqueci minha senha</a>
          </div>
        </div>
        {naoConfirmado ? (
          <div role="alert" style={S.avisoBox}>
            <p style={{ color: T.text, fontSize: 14, lineHeight: 1.6 }}>
              Confirme seu e-mail para liberar o acesso.
            </p>
            {reenviado ? (
              <p style={{ color: T.mute, fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
                Enviamos outro código. Verifique sua caixa de entrada.
              </p>
            ) : (
              <button
                type="button"
                onClick={reenviarConfirmacao}
                disabled={segundosAteReenviar > 0 || reenvio.isPending}
                style={{ ...S.btnSecundario, opacity: segundosAteReenviar > 0 || reenvio.isPending ? 0.6 : 1 }}
              >
                {segundosAteReenviar > 0
                  ? `Reenviar em ${segundosAteReenviar}s`
                  : reenvio.isPending
                    ? 'Reenviando...'
                    : 'Reenviar código'}
              </button>
            )}
            {/*
              Quem já tem o código na caixa de entrada não precisa de outro: o
              caminho dele é digitar o que recebeu. O endereço vai pelo
              `sessionStorage`, e não pela URL — e-mail em query string fica no
              histórico do navegador e sai no cabeçalho `Referer`.
            */}
            <button
              type="button"
              onClick={() => {
                guardarEmailPendente(ultimaTentativa?.email ?? '');
                router.push('/confirmar');
              }}
              style={{ ...S.btnSecundario, marginTop: 8 }}
            >
              Já tenho o código
            </button>
          </div>
        ) : (
          apiError && <div role="alert" style={S.errBox}><p style={{ color: T.danger, fontSize: 14 }}>{apiError}</p></div>
        )}
        <button type="submit" disabled={isPending} style={{ ...S.btn, opacity: isPending ? 0.6 : 1 }}>
          {isPending ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </AuthShell>
  );
}
