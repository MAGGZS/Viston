'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { UserPlus, RefreshCw, Trash2 } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Button, Input, Select, Modal, Badge, Skeleton } from '@/app/components/ui';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';

const schema = yup.object({
  name: yup.string().min(2).required('Obrigatório'),
  email: yup.string().email().required('Obrigatório'),
  password: yup.string().min(8).required('Obrigatório'),
  role: yup.string().oneOf(['ADMIN', 'INSPECTOR', 'VIEWER']).required(),
});

const ROLE_LABELS = { ADMIN: 'Admin', INSPECTOR: 'Inspetor', VIEWER: 'Visualizador' };
const ROLE_VARIANTS = { ADMIN: 'accent', INSPECTOR: 'success', VIEWER: 'default' };
const STATUS_LABELS = { ACTIVE: 'Ativo', DELETED: 'Removido' };

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [createModal, setCreateModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading, refetch, isFetching } = useUsers(page);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { role: 'INSPECTOR' },
  });

  const { show: toast } = useToastStore();

  async function onCreateSubmit(data) {
    try {
      await createUser.mutateAsync(data);
      reset();
      setCreateModal(false);
      toast('Usuário criado!', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao criar usuário', 'error');
    }
  }

  async function handleRoleChange(userId, role) {
    try {
      await updateUser.mutateAsync({ id: userId, role });
      toast('Role atualizado!', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao atualizar', 'error');
    }
  }

  async function handleStatusToggle(user) {
    const newStatus = user.status === 'ACTIVE' ? 'DELETED' : 'ACTIVE';
    try {
      await updateUser.mutateAsync({ id: user.id, status: newStatus });
      toast(newStatus === 'ACTIVE' ? 'Usuário reativado!' : 'Usuário desativado', 'info');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao atualizar', 'error');
    }
  }

  async function handleDelete() {
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      toast('Usuário excluído permanentemente', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao excluir usuário', 'error');
    }
  }

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-page">
        <AdminSidebar />
        <main className="flex-1 p-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-semibold text-white">Usuários</h1>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => refetch()} loading={isFetching}><RefreshCw size={15} /> Atualizar</Button>
              <Button onClick={() => setCreateModal(true)}><UserPlus size={18} /> Novo usuário</Button>
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-card rounded-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  {['Nome', 'E-mail', 'Role', 'Status', 'Ações'].map(h => (
                    <th key={h} className="text-left px-6 py-4 text-mute text-sm font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && [1,2,3,4].map(i => (
                  <tr key={i} className="border-b border-line">
                    {[1,2,3,4,5].map(j => (
                      <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
                {data?.users?.map((u, idx) => (
                  <tr key={u.id} className={`anim-fade-in anim-d${Math.min(idx + 1, 6)} border-b border-line hover:bg-chip transition-colors`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                          <span className="text-black text-xs font-semibold">{u.name[0]}</span>
                        </div>
                        <span className="text-white text-sm">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-mute text-sm">{u.email}</td>
                    <td className="px-6 py-4">
                      <Badge variant={ROLE_VARIANTS[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={u.status === 'ACTIVE' ? 'success' : 'danger'}>
                        {STATUS_LABELS[u.status]}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <select
                          className="bg-chip text-white text-xs rounded-pill px-2 py-1 focus:outline-none"
                          value={u.role}
                          onChange={e => handleRoleChange(u.id, e.target.value)}
                        >
                          <option value="ADMIN">Admin</option>
                          <option value="INSPECTOR">Inspetor</option>
                          <option value="VIEWER">Visualizador</option>
                        </select>
                        <button
                          onClick={() => handleStatusToggle(u)}
                          className={`text-xs px-3 py-1 rounded-pill transition-colors ${
                            u.status === 'ACTIVE'
                              ? 'bg-danger-soft text-danger hover:bg-danger-soft'
                              : 'bg-chip text-ink hover:bg-chip'
                          }`}
                        >
                          {u.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(u)}
                          title="Excluir permanentemente"
                          className="text-xs px-3 py-1 rounded-pill bg-danger-soft text-danger transition-colors flex items-center"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Paginação */}
            {data && data.total > data.limit && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-line">
                <p className="text-mute text-sm">{data.total} usuários</p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setPage(p => p - 1)} disabled={page === 1}>Anterior</Button>
                  <Button variant="secondary" onClick={() => setPage(p => p + 1)} disabled={page * data.limit >= data.total}>Próxima</Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Mobile: redirecionar para home */}
      <div className="lg:hidden flex items-center justify-center min-h-screen bg-page p-6 text-center">
        <div>
          <p className="text-4xl mb-4">🖥️</p>
          <p className="text-white font-semibold text-lg">Painel Admin</p>
          <p className="text-mute text-sm mt-2">Acesse pelo computador para gerenciar usuários</p>
        </div>
      </div>

      {/* Modal excluir usuário */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Excluir usuário">
        <div className="flex flex-col gap-4">
          <p className="text-mute text-sm">
            <span className="text-white font-medium">{deleteTarget?.name}</span> será apagado
            definitivamente do banco de dados. As inspeções feitas por ele continuam no histórico,
            mas sem inspetor vinculado. Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="danger" className="flex-1" onClick={handleDelete} loading={deleteUser.isPending}>Excluir</Button>
          </div>
        </div>
      </Modal>

      {/* Modal criar usuário */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Novo usuário">
        <form onSubmit={handleSubmit(onCreateSubmit)} className="flex flex-col gap-4">
          <Input label="Nome" error={errors.name?.message} {...register('name')} />
          <Input label="E-mail" type="email" error={errors.email?.message} {...register('email')} />
          <Input label="Senha" type="password" error={errors.password?.message} {...register('password')} />
          <Select label="Role" options={[
            { value: 'INSPECTOR', label: 'Inspetor' },
            { value: 'VIEWER', label: 'Visualizador' },
            { value: 'ADMIN', label: 'Administrador' },
          ]} {...register('role')} />
          <div className="flex gap-3 mt-2">
            <Button variant="secondary" className="flex-1" type="button" onClick={() => setCreateModal(false)}>Cancelar</Button>
            <Button className="flex-1" type="submit" loading={createUser.isPending}>Criar</Button>
          </div>
        </form>
      </Modal>
    </RouteGuard>
  );
}
