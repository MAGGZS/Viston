'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/app/components/Logo';
import { useAuthStore } from '@/app/store/auth';
import { useLogin } from '@/app/hooks/useApi';

const schema = yup.object({
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
  password: yup.string().min(1, 'Obrigatório').required('Obrigatório'),
});

const S = {
  page: { minHeight: '100vh', background: '#080810', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  wrap: { width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 },
  card: { width: '100%', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 28, padding: '28px 24px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  input: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '13px 16px', color: 'rgba(255,255,255,0.9)', fontSize: 15, outline: 'none', width: '100%' },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  eyeBtn: { position: 'absolute', right: 6, background: 'none', border: 'none', padding: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center' },
  btn: { width: '100%', background: '#F5C518', color: '#000', fontWeight: 700, fontSize: 15, padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', marginTop: 4, boxShadow: '0 0 20px rgba(245,197,24,0.2)' },
  errBox: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '10px 14px', textAlign: 'center' },
  footer: { color: 'rgba(255,255,255,0.25)', fontSize: 14 },
  link: { color: 'rgba(245,197,24,0.85)', fontWeight: 600, textDecoration: 'none' },
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
    <div style={S.page}>
      <div style={S.wrap}>
        <div className="anim-fade-down" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <h1 className="anim-pop-in" style={{ margin: 0 }}><Logo size={38} /></h1>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, marginTop: 8 }}>Sistema de Vistoria Predial</p>
          </div>
        </div>

        <div className="anim-fade-up anim-d2" style={S.card}>
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={S.field}>
              <label style={S.label}>E-mail</label>
              <input type="email" placeholder="seu@email.com" style={{ ...S.input, ...(errors.email ? { borderColor: 'rgba(239,68,68,0.5)' } : {}) }} {...register('email')} />
              {errors.email && <span style={{ fontSize: 12, color: 'rgb(248,113,113)' }}>{errors.email.message}</span>}
            </div>
            <div style={S.field}>
              <label style={S.label}>Senha</label>
              <div style={S.inputWrap}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  style={{ ...S.input, paddingRight: 46, ...(errors.password ? { borderColor: 'rgba(239,68,68,0.5)' } : {}) }}
                  {...register('password')}
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} style={S.eyeBtn}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password && <span style={{ fontSize: 12, color: 'rgb(248,113,113)' }}>{errors.password.message}</span>}
            </div>
            {apiError && <div style={S.errBox}><p style={{ color: 'rgb(248,113,113)', fontSize: 13 }}>{apiError}</p></div>}
            <button type="submit" disabled={isPending} style={{ ...S.btn, opacity: isPending ? 0.6 : 1 }}>
              {isPending ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="anim-fade-in anim-d4" style={S.footer}>Não tem conta?{' '}<a href="/register" style={S.link}>Cadastre-se</a></p>
      </div>
    </div>
  );
}
