'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/app/components/AuthShell';
import { useAuthStore } from '@/app/store/auth';
import { useCreateUser, useLogin } from '@/app/hooks/useApi';

const schema = yup.object({
  name: yup.string().min(2, 'Mínimo 2 caracteres').required('Obrigatório'),
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
  password: yup.string().min(8, 'Mínimo 8 caracteres').required('Obrigatório'),
});

const S = {
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.44)' },
  input: { background: '#232323', border: '1px solid transparent', borderRadius: 16, padding: '13px 16px', color: 'rgba(255,255,255,0.96)', fontSize: 15, outline: 'none', width: '100%' },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  eyeBtn: { position: 'absolute', right: 6, background: 'none', border: 'none', padding: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.44)', display: 'flex', alignItems: 'center' },
  btn: { width: '100%', background: '#F5C518', color: '#000', fontWeight: 500, fontSize: 15, padding: '14px', borderRadius: 16, border: 'none', cursor: 'pointer', marginTop: 4 },
};

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const createUser = useCreateUser();
  const loginMutation = useLogin();
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: yupResolver(schema) });
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(data) {
    try {
      await createUser.mutateAsync(data);
      const res = await loginMutation.mutateAsync({ email: data.email, password: data.password });
      login(res.access_token, res.refresh_token, res.user);
      router.replace('/');
    } catch {}
  }

  const apiError = createUser.error?.response?.data?.error?.message;
  const isPending = createUser.isPending || loginMutation.isPending;

  const fields = [
    { name: 'name', label: 'Nome', type: 'text', placeholder: 'Seu nome completo' },
    { name: 'email', label: 'E-mail', type: 'email', placeholder: 'seu@email.com' },
    { name: 'password', label: 'Senha', type: 'password', placeholder: 'Mínimo 8 caracteres' },
  ];

  return (
    <AuthShell
      title="Criar conta"
      subtitle="Depois de entrar, peça a chave do prédio ao administrador para começar a vistoriar."
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ color: 'rgba(255,255,255,0.26)', fontSize: 14 }}>
            Já tem conta?{' '}
            <a href="/login" style={{ color: 'rgba(245,197,24,0.85)', fontWeight: 600, textDecoration: 'none' }}>Entrar</a>
          </p>
          <p style={{ color: 'rgba(255,255,255,0.26)', fontSize: 13 }}>
            Vai administrar um prédio?{' '}
            <a href="/register/gestor" style={{ color: 'rgba(245,197,24,0.85)', fontWeight: 600, textDecoration: 'none' }}>Cadastre-se como gestor</a>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {fields.map(({ name, label, type, placeholder }) => {
              const isPassword = type === 'password';
              const inputStyle = { ...S.input, ...(isPassword ? { paddingRight: 46 } : {}), ...(errors[name] ? { borderColor: 'rgba(248,113,113,0.5)' } : {}) };
              return (
                <div key={name} style={S.field}>
                  <label style={S.label}>{label}</label>
                  <div style={S.inputWrap}>
                    <input
                      type={isPassword && showPassword ? 'text' : type}
                      placeholder={placeholder}
                      style={inputStyle}
                      {...register(name)}
                    />
                    {isPassword && (
                      <button type="button" onClick={() => setShowPassword(v => !v)} style={S.eyeBtn}
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    )}
                  </div>
                  {errors[name] && <span style={{ fontSize: 12, color: '#F87171' }}>{errors[name].message}</span>}
                </div>
              );
            })}
            {apiError && (
              <div style={{ background: 'rgba(248,113,113,0.13)', borderRadius: 16, padding: '11px 14px' }}>
                <p style={{ color: '#F87171', fontSize: 13, textAlign: 'center' }}>{apiError}</p>
              </div>
            )}
        <button type="submit" disabled={isPending} style={{ ...S.btn, opacity: isPending ? 0.6 : 1 }}>
          {isPending ? 'Criando conta...' : 'Criar conta'}
        </button>
      </form>
    </AuthShell>
  );
}
