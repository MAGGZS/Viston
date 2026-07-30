'use client';

import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff, Building2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Spinner } from '@/components/ui';

const schema = yup.object({
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
  password: yup.string().required('Obrigatório'),
});

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [showPass, setShowPass] = useState(false);
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: yupResolver(schema),
  });

  async function onSubmit(values) {
    setServerError('');
    try {
      const { data } = await api.post('/auth/login', values);
      setAuth(data.accessToken, data.refreshToken, data.user);
      router.replace('/home');
    } catch (err) {
      setServerError(err.response?.data?.error || 'Erro ao fazer login');
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-bg-primary" />
          </div>
          <h1 className="text-2xl font-extrabold">Viston</h1>
          <p className="text-text-secondary text-sm mt-1">Vistoria Predial</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <label className="label">E-mail</label>
            <input
              {...register('email')}
              type="email"
              placeholder="seu@email.com"
              className="input"
              autoComplete="email"
            />
            {errors.email && <p className="text-status-problema text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="label">Senha</label>
            <div className="relative">
              <input
                {...register('password')}
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                className="input pr-12"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-status-problema text-xs mt-1">{errors.password.message}</p>}
          </div>

          {serverError && (
            <div className="bg-status-problema/10 border border-status-problema/30 rounded-xl px-4 py-3 text-status-problema text-sm">
              {serverError}
            </div>
          )}

          <button type="submit" disabled={isSubmitting} className="btn-primary mt-2">
            {isSubmitting ? <Spinner size="sm" /> : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
