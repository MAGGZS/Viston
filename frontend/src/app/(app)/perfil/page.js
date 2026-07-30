'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useRouter } from 'next/navigation';
import { LogOut, Trash2, Lock, User } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Avatar, Spinner } from '@/components/ui';

const profileSchema = yup.object({
  name: yup.string().min(2, 'Mínimo 2 caracteres').required('Obrigatório'),
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
});

const passwordSchema = yup.object({
  currentPassword: yup.string().required('Obrigatório'),
  newPassword: yup.string().min(6, 'Mínimo 6 caracteres').required('Obrigatório'),
});

export default function PerfilPage() {
  const router = useRouter();
  const { user, updateUser, logout } = useAuthStore();
  const [tab, setTab] = useState('profile');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const profileForm = useForm({
    resolver: yupResolver(profileSchema),
    defaultValues: { name: user?.name || '', email: user?.email || '' },
  });

  const passwordForm = useForm({ resolver: yupResolver(passwordSchema) });

  async function onSaveProfile(values) {
    setError(''); setSuccess('');
    try {
      const { data } = await api.patch('/users/me', values);
      updateUser(data);
      setSuccess('Perfil atualizado!');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar');
    }
  }

  async function onChangePassword(values) {
    setError(''); setSuccess('');
    try {
      await api.patch('/users/me/password', values);
      setSuccess('Senha alterada com sucesso!');
      passwordForm.reset();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao alterar senha');
    }
  }

  async function onDeleteAccount() {
    try {
      await api.delete('/users/me');
      logout();
      router.replace('/login');
    } catch {
      setError('Erro ao excluir conta');
    }
  }

  const ROLE_LABEL = { ADMIN: 'Administrador', INSPECTOR: 'Inspetor', VIEWER: 'Visualizador' };

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Avatar name={user?.name} url={user?.avatarUrl} size="lg" />
        <div>
          <h1 className="text-xl font-extrabold">{user?.name}</h1>
          <span className="badge bg-accent/20 text-accent text-xs">{ROLE_LABEL[user?.role]}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-secondary rounded-xl p-1 mb-6">
        {[['profile', 'Perfil', User], ['password', 'Senha', Lock]].map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => { setTab(key); setSuccess(''); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === key ? 'bg-accent text-bg-primary' : 'text-text-secondary'
            }`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {success && <div className="bg-status-ok/10 border border-status-ok/30 rounded-xl px-4 py-3 text-status-ok text-sm mb-4">{success}</div>}
      {error && <div className="bg-status-problema/10 border border-status-problema/30 rounded-xl px-4 py-3 text-status-problema text-sm mb-4">{error}</div>}

      {tab === 'profile' && (
        <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="flex flex-col gap-4">
          <div>
            <label className="label">Nome</label>
            <input {...profileForm.register('name')} className="input" />
            {profileForm.formState.errors.name && <p className="text-status-problema text-xs mt-1">{profileForm.formState.errors.name.message}</p>}
          </div>
          <div>
            <label className="label">E-mail</label>
            <input {...profileForm.register('email')} type="email" className="input" />
            {profileForm.formState.errors.email && <p className="text-status-problema text-xs mt-1">{profileForm.formState.errors.email.message}</p>}
          </div>
          <button type="submit" disabled={profileForm.formState.isSubmitting} className="btn-primary">
            {profileForm.formState.isSubmitting ? <Spinner size="sm" /> : 'Salvar alterações'}
          </button>
        </form>
      )}

      {tab === 'password' && (
        <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="flex flex-col gap-4">
          <div>
            <label className="label">Senha atual</label>
            <input {...passwordForm.register('currentPassword')} type="password" className="input" />
            {passwordForm.formState.errors.currentPassword && <p className="text-status-problema text-xs mt-1">{passwordForm.formState.errors.currentPassword.message}</p>}
          </div>
          <div>
            <label className="label">Nova senha</label>
            <input {...passwordForm.register('newPassword')} type="password" className="input" />
            {passwordForm.formState.errors.newPassword && <p className="text-status-problema text-xs mt-1">{passwordForm.formState.errors.newPassword.message}</p>}
          </div>
          <button type="submit" disabled={passwordForm.formState.isSubmitting} className="btn-primary">
            {passwordForm.formState.isSubmitting ? <Spinner size="sm" /> : 'Alterar senha'}
          </button>
        </form>
      )}

      {/* Danger zone */}
      <div className="mt-8 pt-6 border-t border-white/10 flex flex-col gap-3">
        <button onClick={logout} className="btn-secondary w-full">
          <LogOut className="w-4 h-4" /> Sair
        </button>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-full text-status-problema font-semibold border border-status-problema/30 hover:bg-status-problema/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" /> Excluir conta
        </button>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-6">
          <div className="card w-full max-w-sm">
            <h2 className="font-extrabold text-lg mb-2">Excluir conta?</h2>
            <p className="text-text-secondary text-sm mb-6">
              Esta ação é irreversível. Seus dados pessoais serão anonimizados, mas os relatórios de vistoria permanecerão no sistema.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={onDeleteAccount} className="flex-1 py-3 rounded-full bg-status-problema text-white font-bold">
                Confirmar exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
