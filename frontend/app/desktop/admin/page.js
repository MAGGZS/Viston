'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { UserPlus, RefreshCw, Trash2, Pencil } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Avatar } from '@/app/components/Avatar';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Button, Input, Modal, Badge, Skeleton } from '@/app/components/ui';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '@/app/hooks/useApi';
import { useExitTransition, useKeepWhileClosing } from '@/app/hooks/useExitTransition';
import { useToastStore } from '@/app/store/toast';

// Sem `role`: quem define o nível de acesso é o gestor do prédio, depois do
// vínculo. Conta criada por aqui nasce como visualizadora.
const schema = yup.object({
  name: yup.string().min(2).required('Obrigatório'),
  email: yup.string().email().required('Obrigatório'),
  password: yup.string().min(8).required('Obrigatório'),
  password_confirmation: yup
    .string()
    .oneOf([yup.ref('password')], 'As senhas não coincidem')
    .required('Obrigatório'),
});

const renameSchema = yup.object({
  name: yup.string().min(2, 'Mínimo 2 caracteres').required('Obrigatório'),
});

const ROLE_LABELS = { ADMIN: 'Admin', GESTOR: 'Gestor', INSPECTOR: 'Inspetor', VIEWER: 'Visualizador' };
const ROLE_VARIANTS = { ADMIN: 'accent', GESTOR: 'accent', INSPECTOR: 'success', VIEWER: 'default' };
const STATUS_LABELS = { ACTIVE: 'Ativo', DELETED: 'Removido' };

/** Renomear é a única edição de dados que sobrou para o admin. */
function RenameUserModal({ user, open, onClose }) {
  const updateUser = useUpdateUser();
  const { show: toast } = useToastStore();
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: yupResolver(renameSchema),
    defaultValues: { name: user.name },
  });

  async function onSubmit({ name }) {
    try {
      await updateUser.mutateAsync({ id: user.id, name });
      toast('Nome atualizado!', 'success');
      onClose();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao atualizar', 'error');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar nome">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <p className="text-mute text-sm">
          O nome assina as vistorias já registradas por <span className="text-white">{user.email}</span>.
        </p>
        <Input label="Nome" error={errors.name?.message} {...register('name')} />
        <div className="flex gap-3 mt-2">
          <Button variant="secondary" className="flex-1" type="button" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" type="submit" loading={updateUser.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [createModal, setCreateModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { mounted: renameMounted } = useExitTransition(!!renameTarget);
  const renameUser = useKeepWhileClosing(renameTarget, !!renameTarget);

  const { data, isLoading, refetch, isFetching } = useUsers(page);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: yupResolver(schema),
  });

  const { show: toast } = useToastStore();

  // A confirmação não vai para a API: o cadastro recusa campo desconhecido.
  async function onCreateSubmit({ password_confirmation, ...data }) {
    try {
      await createUser.mutateAsync(data);
      reset();
      setCreateModal(false);
      toast('Usuário criado!', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao criar usuário', 'error');
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
            <div>
              <h1 className="text-2xl font-semibold text-white">Usuários</h1>
              <p className="text-mute text-sm mt-0.5">
                O nível de acesso é definido pelo gestor do prédio a que a pessoa se vincula.
              </p>
            </div>
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
                        <Avatar user={u} size={32} />
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
                        <button
                          onClick={() => setRenameTarget(u)}
                          title="Editar nome"
                          className="text-xs px-3 py-1 rounded-pill bg-chip text-mute hover:text-white transition-colors flex items-center"
                        >
                          <Pencil size={14} />
                        </button>
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
          <Input label="Confirmar senha" type="password" error={errors.password_confirmation?.message} {...register('password_confirmation')} />
          <p className="text-mute text-xs leading-relaxed">
            A conta nasce como visualizadora. Quem define se ela vistoria é o gestor do prédio,
            depois que ela se vincular pela chave.
          </p>
          <div className="flex gap-3 mt-2">
            <Button variant="secondary" className="flex-1" type="button" onClick={() => setCreateModal(false)}>Cancelar</Button>
            <Button className="flex-1" type="submit" loading={createUser.isPending}>Criar</Button>
          </div>
        </form>
      </Modal>

      {/* Segurado montado durante a saída, senão a caixa some num quadro */}
      {renameMounted && renameUser && (
        <RenameUserModal
          key={renameUser.id}
          user={renameUser}
          open={!!renameTarget}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </RouteGuard>
  );
}
