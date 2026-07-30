'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, ShieldCheck, Eye, Wrench, MoreVertical } from 'lucide-react';
import { useUsers, useCreateUser, useUpdateUserRole, useUpdateUserStatus } from '@/hooks/useUsers';
import { Avatar, Badge } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { formatDate } from '@/lib/utils';
import type { Role, User } from '@/types';

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'INSPECTOR', 'VIEWER']),
});

const ROLE_ICONS = { ADMIN: ShieldCheck, INSPECTOR: Wrench, VIEWER: Eye };
const ROLE_LABELS = { ADMIN: 'Admin', INSPECTOR: 'Inspetor', VIEWER: 'Visualizador' };
const ROLE_VARIANTS = { ADMIN: 'accent', INSPECTOR: 'ok', VIEWER: 'default' } as const;

export default function AdminUsuariosPage() {
  const { data: users = [], isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateRole = useUpdateUserRole();
  const updateStatus = useUpdateUserStatus();

  const [showCreate, setShowCreate] = useState(false);
  const [actionUser, setActionUser] = useState<User | null>(null);

  const form = useForm({ resolver: zodResolver(createSchema), defaultValues: { role: 'INSPECTOR' as Role } });

  const onCreateUser = form.handleSubmit((data) => {
    createUser.mutate(data as any, {
      onSuccess: () => { setShowCreate(false); form.reset(); },
    });
  });

  const activeUsers = users.filter((u) => u.status === 'ACTIVE');
  const deletedUsers = users.filter((u) => u.status === 'DELETED');

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary">Usuários</h1>
          <p className="text-text-secondary text-sm mt-1">{activeUsers.length} ativos · {deletedUsers.length} removidos</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <UserPlus size={18} />
          Novo Usuário
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-bg-card rounded-2xl border border-white/5 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Usuário</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Criado em</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const RoleIcon = ROLE_ICONS[user.role];
                return (
                  <tr key={user.id} className="border-b border-white/5 hover:bg-bg-elevated/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                        <div>
                          <p className="font-semibold text-text-primary text-sm">{user.name}</p>
                          <p className="text-xs text-text-muted">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={ROLE_VARIANTS[user.role]}>
                        <RoleIcon size={11} className="mr-1" />
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={user.status === 'ACTIVE' ? 'ok' : 'error'}>
                        {user.status === 'ACTIVE' ? 'Ativo' : 'Removido'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-sm text-text-secondary">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      {user.status === 'ACTIVE' && (
                        <button
                          onClick={() => setActionUser(user)}
                          className="text-text-muted hover:text-text-primary transition-colors p-1"
                        >
                          <MoreVertical size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal criar usuário */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Novo Usuário">
        <form onSubmit={onCreateUser} className="flex flex-col gap-4">
          <Input label="Nome" error={form.formState.errors.name?.message} {...form.register('name')} />
          <Input label="E-mail" type="email" error={form.formState.errors.email?.message} {...form.register('email')} />
          <Input label="Senha provisória" type="password" error={form.formState.errors.password?.message} {...form.register('password')} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">Role</label>
            <select
              {...form.register('role')}
              className="bg-bg-elevated border border-white/10 rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="INSPECTOR">Inspetor</option>
              <option value="VIEWER">Visualizador</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
          {createUser.isError && <p className="text-xs text-status-error">E-mail já cadastrado</p>}
          <Button type="submit" loading={createUser.isPending}>Criar usuário</Button>
        </form>
      </Modal>

      {/* Modal ações do usuário */}
      <Modal open={!!actionUser} onClose={() => setActionUser(null)} title="Ações do Usuário">
        {actionUser && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 mb-2">
              <Avatar name={actionUser.name} src={actionUser.avatarUrl} size="md" />
              <div>
                <p className="font-bold text-text-primary">{actionUser.name}</p>
                <p className="text-xs text-text-muted">{actionUser.email}</p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Alterar role</label>
              <select
                defaultValue={actionUser.role}
                onChange={(e) => {
                  updateRole.mutate({ id: actionUser.id, role: e.target.value as Role });
                  setActionUser({ ...actionUser, role: e.target.value as Role });
                }}
                className="bg-bg-elevated border border-white/10 rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="INSPECTOR">Inspetor</option>
                <option value="VIEWER">Visualizador</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>

            <Button
              variant="danger"
              onClick={() => {
                updateStatus.mutate({ id: actionUser.id, status: 'DELETED' });
                setActionUser(null);
              }}
              loading={updateStatus.isPending}
            >
              Desativar usuário
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
