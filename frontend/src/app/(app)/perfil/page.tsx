'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogOut, Trash2, KeyRound, User } from 'lucide-react';
import { Avatar } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateMe, useChangePassword, useDeleteMe } from '@/hooks/useUsers';
import { useAuthStore } from '@/store/auth.store';

const profileSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('E-mail inválido'),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Obrigatório'),
    newPassword: z.string().min(6, 'Mínimo 6 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Senhas não coincidem',
    path: ['confirmPassword'],
  });

export default function PerfilPage() {
  const { user, logout } = useAuth();
  const updateUser = useAuthStore((s) => s.updateUser);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const updateMe = useUpdateMe();
  const changePassword = useChangePassword();
  const deleteMe = useDeleteMe();

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name || '', email: user?.email || '' },
  });

  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSaveProfile = profileForm.handleSubmit((data) => {
    updateMe.mutate(data, {
      onSuccess: (updated) => updateUser({ name: updated.name, email: updated.email }),
    });
  });

  const onChangePassword = passwordForm.handleSubmit((data) => {
    changePassword.mutate(
      { currentPassword: data.currentPassword, newPassword: data.newPassword },
      {
        onSuccess: () => {
          setShowPasswordModal(false);
          passwordForm.reset();
        },
      },
    );
  });

  const onDeleteAccount = () => {
    deleteMe.mutate(undefined, { onSuccess: () => logout() });
  };

  const ROLE_LABELS = { ADMIN: 'Administrador', INSPECTOR: 'Inspetor', VIEWER: 'Visualizador' };

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-extrabold text-text-primary mb-6">Perfil</h1>

      {/* Avatar e role */}
      <div className="flex items-center gap-4 mb-6">
        <Avatar name={user?.name || ''} src={user?.avatarUrl} size="lg" />
        <div>
          <p className="font-bold text-text-primary text-lg">{user?.name}</p>
          <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full font-semibold">
            {ROLE_LABELS[user?.role || 'VIEWER']}
          </span>
        </div>
      </div>

      {/* Formulário de perfil */}
      <form onSubmit={onSaveProfile} className="flex flex-col gap-4 mb-6">
        <Input
          label="Nome"
          error={profileForm.formState.errors.name?.message}
          {...profileForm.register('name')}
        />
        <Input
          label="E-mail"
          type="email"
          error={profileForm.formState.errors.email?.message}
          {...profileForm.register('email')}
        />
        {updateMe.isSuccess && (
          <p className="text-xs text-status-ok">Perfil atualizado com sucesso!</p>
        )}
        <Button type="submit" variant="secondary" loading={updateMe.isPending}>
          Salvar alterações
        </Button>
      </form>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => setShowPasswordModal(true)}
          className="flex items-center gap-3 bg-bg-card rounded-2xl p-4 border border-white/5 text-left hover:border-white/15 transition-all"
        >
          <KeyRound size={20} className="text-accent" />
          <span className="font-semibold text-text-primary">Alterar senha</span>
        </button>

        <button
          onClick={logout}
          className="flex items-center gap-3 bg-bg-card rounded-2xl p-4 border border-white/5 text-left hover:border-white/15 transition-all"
        >
          <LogOut size={20} className="text-text-secondary" />
          <span className="font-semibold text-text-secondary">Sair</span>
        </button>

        <button
          onClick={() => setShowDeleteModal(true)}
          className="flex items-center gap-3 bg-status-error/5 rounded-2xl p-4 border border-status-error/20 text-left hover:border-status-error/40 transition-all"
        >
          <Trash2 size={20} className="text-status-error" />
          <span className="font-semibold text-status-error">Excluir conta</span>
        </button>
      </div>

      {/* Modal alterar senha */}
      <Modal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} title="Alterar Senha">
        <form onSubmit={onChangePassword} className="flex flex-col gap-4">
          <Input
            label="Senha atual"
            type="password"
            error={passwordForm.formState.errors.currentPassword?.message}
            {...passwordForm.register('currentPassword')}
          />
          <Input
            label="Nova senha"
            type="password"
            error={passwordForm.formState.errors.newPassword?.message}
            {...passwordForm.register('newPassword')}
          />
          <Input
            label="Confirmar nova senha"
            type="password"
            error={passwordForm.formState.errors.confirmPassword?.message}
            {...passwordForm.register('confirmPassword')}
          />
          {changePassword.isError && (
            <p className="text-xs text-status-error">Senha atual incorreta</p>
          )}
          <Button type="submit" loading={changePassword.isPending}>
            Alterar senha
          </Button>
        </form>
      </Modal>

      {/* Modal excluir conta */}
      <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Excluir Conta">
        <div className="flex flex-col gap-4">
          <p className="text-text-secondary text-sm">
            Esta ação é <strong className="text-text-primary">irreversível</strong>. Seus dados
            pessoais serão anonimizados, mas os relatórios de vistoria permanecerão no sistema.
          </p>
          <Button
            variant="danger"
            loading={deleteMe.isPending}
            onClick={onDeleteAccount}
          >
            Confirmar exclusão
          </Button>
          <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
            Cancelar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
