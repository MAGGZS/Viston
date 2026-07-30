'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Building2 } from 'lucide-react';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { loginMutation } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = (data: FormData) => loginMutation.mutate(data);

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center mb-4">
          <Building2 size={32} className="text-bg-primary" />
        </div>
        <h1 className="text-3xl font-extrabold text-text-primary">Viston</h1>
        <p className="text-text-secondary text-sm mt-1">Sistema de Vistoria Predial</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="relative">
          <Input
            label="Senha"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-9 text-text-muted hover:text-text-primary transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {loginMutation.isError && (
          <p className="text-sm text-status-error text-center">
            E-mail ou senha incorretos
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          loading={loginMutation.isPending}
          className="mt-2"
        >
          Entrar
        </Button>
      </form>

      <p className="text-center text-xs text-text-muted mt-8">
        Acesso restrito. Contas criadas pelo administrador.
      </p>
    </div>
  );
}
