'use client';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/auth';
import { useLogin } from '@/app/hooks/useApi';

const schema = yup.object({
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
  password: yup.string().min(1, 'Obrigatório').required('Obrigatório'),
});

function Field({ label, error, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '11px', fontWeight: 600, color: '#9A9A9A', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </label>
      {children}
      {error && <span style={{ fontSize: '12px', color: '#f87171' }}>{error}</span>}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const { mutateAsync, isPending, error } = useLogin();

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: yupResolver(schema),
  });

  async function onSubmit(data) {
    try {
      const res = await mutateAsync(data);
      login(res.access_token, res.refresh_token, res.user);
      router.replace('/');
    } catch {}
  }

  const apiError = error?.response?.data?.error?.message;

  const inputStyle = {
    width: '100%',
    background: '#1A1A1A',
    border: '1px solid #2A2A2A',
    borderRadius: '12px',
    padding: '14px 16px',
    color: '#fff',
    fontSize: '15px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '56px', height: '56px', background: '#F5C518', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#000', fontSize: '22px', fontWeight: 900 }}>V</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 700, margin: 0 }}>Viston</h1>
            <p style={{ color: '#9A9A9A', fontSize: '14px', marginTop: '4px' }}>Sistema de Vistoria Predial</p>
          </div>
        </div>

        {/* Card */}
        <div style={{ width: '100%', background: '#141414', border: '1px solid #222', borderRadius: '20px', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <Field label="E-mail" error={errors.email?.message}>
              <input type="email" placeholder="seu@email.com" style={inputStyle} {...register('email')} />
            </Field>

            <Field label="Senha" error={errors.password?.message}>
              <input type="password" placeholder="••••••••" style={inputStyle} {...register('password')} />
            </Field>

            {apiError && (
              <p style={{ color: '#f87171', fontSize: '13px', textAlign: 'center', background: 'rgba(153,27,27,0.2)', borderRadius: '10px', padding: '10px' }}>
                {apiError}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              style={{
                width: '100%',
                background: isPending ? '#A88A00' : '#F5C518',
                color: '#000',
                fontWeight: 700,
                fontSize: '15px',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                cursor: isPending ? 'not-allowed' : 'pointer',
                marginTop: '4px',
                transition: 'background 0.2s',
              }}
            >
              {isPending ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p style={{ color: '#555', fontSize: '14px' }}>
          Não tem conta?{' '}
          <a href="/register" style={{ color: '#F5C518', textDecoration: 'none', fontWeight: 600 }}>Cadastre-se</a>
        </p>
      </div>
    </div>
  );
}
