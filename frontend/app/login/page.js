'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/app/components/AuthShell';
import { useAuthStore } from '@/app/store/auth';
import { T } from '@/app/lib/theme';
import { useLogin } from '@/app/hooks/useApi';

const schema = yup.object({
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
  password: yup.string().min(1, 'Obrigatório').required('Obrigatório'),
});

const S = {
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 400, color: T.mute },
  input: { background: T.chip, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', borderRadius: 16, padding: '13px 16px', color: T.text, fontSize: 16, outline: 'none', width: '100%' },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  eyeBtn: { position: 'absolute', right: 6, background: 'none', border: 'none', padding: 8, cursor: 'pointer', color: T.mute, display: 'flex', alignItems: 'center' },
  btn: { width: '100%', background: T.accent, color: T.onAccent, fontWeight: 500, fontSize: 15, padding: '14px', borderRadius: 16, border: 'none', cursor: 'pointer', marginTop: 4 },
  errBox: { background: 'rgba(248,113,113,0.13)', borderRadius: 16, padding: '11px 14px', textAlign: 'center' },
  footer: { color: T.faint, fontSize: 14 },
  link: { color: T.accentInk, fontWeight: 500, textDecoration: 'none' },
};

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const { mutateAsync, isPending, error } = useLogin();
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: yupResolver(schema) });
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(data) {
    try {
      const res = await mutateAsync(data);
      login(res.access_token, res.refresh_token, res.user);
      router.replace('/');
    } catch {}
  }

  const apiError = error?.response?.data?.error?.message;

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
        </div>
        {apiError && <div role="alert" style={S.errBox}><p style={{ color: T.danger, fontSize: 14 }}>{apiError}</p></div>}
        <button type="submit" disabled={isPending} style={{ ...S.btn, opacity: isPending ? 0.6 : 1 }}>
          {isPending ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </AuthShell>
  );
}
