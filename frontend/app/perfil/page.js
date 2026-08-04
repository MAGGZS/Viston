'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { LogOut } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { BottomNav } from '@/app/components/BottomNav';
import { Button, Input, Card, Modal } from '@/app/components/ui';
import { useAuthStore } from '@/app/store/auth';
import { useUpdateMe, useChangePassword, useDeleteMe } from '@/app/hooks/useApi';

const profileSchema = yup.object({
  name: yup.string().min(2).required('Obrigatório'),
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
});

const passwordSchema = yup.object({
  current_password: yup.string().required('Obrigatório'),
  new_password: yup.string().min(8, 'Mínimo 8 caracteres').required('Obrigatório'),
});

const ROLE_LABELS = { ADMIN: 'Administrador', INSPECTOR: 'Inspetor', VIEWER: 'Visualizador' };

export default function PerfilPage() {
  const { user, setUser, logout } = useAuthStore();
  const router = useRouter();
  const [deleteModal, setDeleteModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const updateMe = useUpdateMe();
  const changePassword = useChangePassword();
  const deleteMe = useDeleteMe();

  const profileForm = useForm({
    resolver: yupResolver(profileSchema),
    defaultValues: { name: user?.name || '', email: user?.email || '' },
  });

  const passwordForm = useForm({ resolver: yupResolver(passwordSchema) });

  async function onProfileSubmit(data) {
    try {
      const updated = await updateMe.mutateAsync(data);
      setUser(updated);
      setSuccessMsg('Perfil atualizado!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      profileForm.setError('root', { message: e?.response?.data?.error?.message || 'Erro ao atualizar' });
    }
  }

  async function onPasswordSubmit(data) {
    try {
      await changePassword.mutateAsync(data);
      passwordForm.reset();
      setSuccessMsg('Senha alterada!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      passwordForm.setError('root', { message: e?.response?.data?.error?.message || 'Senha atual incorreta' });
    }
  }

  async function handleDelete() {
    try {
      await deleteMe.mutateAsync();
      logout();
      router.replace('/login');
    } catch (e) {
      alert(e?.response?.data?.error?.message || 'Erro ao excluir conta');
    }
  }

  return (
    <RouteGuard>
      <div className="min-h-screen bg-[#0D0D0D] pb-24">
        <div className="px-5 pt-12 pb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Perfil</h1>
            <button onClick={() => { logout(); router.replace('/login'); }} className="text-[#9A9A9A] hover:text-white">
              <LogOut size={22} />
            </button>
          </div>
        </div>

        <div className="px-5 flex flex-col gap-5">
          {/* Avatar + role */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#F5C518] flex items-center justify-center">
              <span className="text-black font-bold text-2xl">{user?.name?.[0]?.toUpperCase()}</span>
            </div>
            <div>
              <p className="text-white font-bold text-lg">{user?.name}</p>
              <span className="text-xs bg-[#F5C518]/20 text-[#F5C518] px-2 py-0.5 rounded-full">
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
            </div>
          </div>

          {successMsg && (
            <p className="text-green-400 text-sm text-center bg-green-900/20 rounded-xl p-3">{successMsg}</p>
          )}

          {/* Editar perfil */}
          <Card>
            <h2 className="text-white font-semibold mb-4">Dados pessoais</h2>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="flex flex-col gap-4">
              <Input label="Nome" error={profileForm.formState.errors.name?.message} {...profileForm.register('name')} />
              <Input label="E-mail" type="email" error={profileForm.formState.errors.email?.message} {...profileForm.register('email')} />
              {profileForm.formState.errors.root && (
                <p className="text-red-400 text-sm">{profileForm.formState.errors.root.message}</p>
              )}
              <Button type="submit" loading={updateMe.isPending} className="w-full">Salvar</Button>
            </form>
          </Card>

          {/* Trocar senha */}
          <Card>
            <h2 className="text-white font-semibold mb-4">Alterar senha</h2>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="flex flex-col gap-4">
              <Input label="Senha atual" type="password" error={passwordForm.formState.errors.current_password?.message} {...passwordForm.register('current_password')} />
              <Input label="Nova senha" type="password" error={passwordForm.formState.errors.new_password?.message} {...passwordForm.register('new_password')} />
              {passwordForm.formState.errors.root && (
                <p className="text-red-400 text-sm">{passwordForm.formState.errors.root.message}</p>
              )}
              <Button type="submit" loading={changePassword.isPending} className="w-full">Alterar senha</Button>
            </form>
          </Card>

          {/* Excluir conta */}
          <Card>
            <h2 className="text-white font-semibold mb-2">Zona de perigo</h2>
            <p className="text-[#9A9A9A] text-sm mb-4">A exclusão é irreversível. Seus relatórios serão mantidos de forma anônima.</p>
            <Button variant="danger" className="w-full" onClick={() => setDeleteModal(true)}>
              Excluir minha conta
            </Button>
          </Card>
        </div>

        <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Excluir conta">
          <p className="text-[#9A9A9A] text-sm mb-6">
            Tem certeza? Esta ação é <strong className="text-white">irreversível</strong>. Seu nome e e-mail serão anonimizados, mas seus relatórios serão mantidos.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteModal(false)}>Cancelar</Button>
            <Button variant="danger" className="flex-1" loading={deleteMe.isPending} onClick={handleDelete}>
              Confirmar exclusão
            </Button>
          </div>
        </Modal>

        <BottomNav />
      </div>
    </RouteGuard>
  );
}
