'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { UserPlus, X, Pencil, UserX, UserCheck } from 'lucide-react';
import api from '@/lib/api';
import { Avatar, Badge, Spinner } from '@/components/ui';
import clsx from 'clsx';

const createSchema = yup.object({
  name: yup.string().min(2).required('Obrigatório'),
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
  password: yup.string().min(6, 'Mínimo 6 caracteres').required('Obrigatório'),
  role: yup.string().oneOf(['ADMIN', 'INSPECTOR', 'VIEWER']).required('Obrigatório'),
});

const ROLE_LABEL = { ADMIN: 'Admin', INSPECTOR: 'Inspetor', VIEWER: 'Visualizador' };
const ROLE_VARIANT = { ADMIN: 'accent', INSPECTOR: 'ok', VIEWER: 'default' };

export default function AdminUsuariosPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [serverError, setServerError] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: yupResolver(createSchema),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/users', data),
    onSuccess: () => { qc.invalidateQueries(['users']); setShowModal(false); reset(); },
    onError: (err) => setServerError(err.response?.data?.error || 'Erro ao criar usuário'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries(['users']),
  });

  function toggleStatus(user) {
    updateMutation.mutate({
      id: user.id,
      data: { status: user.status === 'ACTIVE' ? 'DELETED' : 'ACTIVE' },
    });
  }

  function openCreate() {
    setServerError('');
    reset();
    setShowModal(true);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold">Usuários</h1>
        <button onClick={openCreate} className="btn-primary">
          <UserPlus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <div className="bg-bg-secondary rounded-2xl overflow-hidden border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-text-secondary">
                <th className="text-left px-5 py-3 font-semibold">Usuário</th>
                <th className="text-left px-5 py-3 font-semibold">E-mail</th>
                <th className="text-left px-5 py-3 font-semibold">Perfil</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={user.name} url={user.avatarUrl} size="sm" />
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-text-secondary">{user.email}</td>
                  <td className="px-5 py-3">
                    <Badge variant={ROLE_VARIANT[user.role]}>{ROLE_LABEL[user.role]}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={user.status === 'ACTIVE' ? 'ok' : 'default'}>
                      {user.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <select
                        value={user.role}
                        onChange={(e) => updateMutation.mutate({ id: user.id, data: { role: e.target.value } })}
                        className="bg-bg-primary border border-white/10 rounded-lg px-2 py-1 text-xs text-text-secondary"
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="INSPECTOR">Inspetor</option>
                        <option value="VIEWER">Visualizador</option>
                      </select>
                      <button
                        onClick={() => toggleStatus(user)}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-text-secondary"
                        title={user.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
                      >
                        {user.status === 'ACTIVE'
                          ? <UserX className="w-4 h-4 text-status-problema" />
                          : <UserCheck className="w-4 h-4 text-status-ok" />
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create user modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-extrabold text-lg">Novo Usuário</h2>
              <button onClick={() => setShowModal(false)} className="text-text-secondary hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit((d) => { setServerError(''); createMutation.mutate(d); })} className="flex flex-col gap-4">
              <div>
                <label className="label">Nome</label>
                <input {...register('name')} className="input" placeholder="Nome completo" />
                {errors.name && <p className="text-status-problema text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="label">E-mail</label>
                <input {...register('email')} type="email" className="input" placeholder="email@exemplo.com" />
                {errors.email && <p className="text-status-problema text-xs mt-1">{errors.email.message}</p>}
              </div>
              <div>
                <label className="label">Senha provisória</label>
                <input {...register('password')} type="password" className="input" placeholder="Mínimo 6 caracteres" />
                {errors.password && <p className="text-status-problema text-xs mt-1">{errors.password.message}</p>}
              </div>
              <div>
                <label className="label">Perfil</label>
                <select {...register('role')} className="input">
                  <option value="INSPECTOR">Inspetor</option>
                  <option value="VIEWER">Visualizador</option>
                  <option value="ADMIN">Administrador</option>
                </select>
                {errors.role && <p className="text-status-problema text-xs mt-1">{errors.role.message}</p>}
              </div>

              {serverError && (
                <div className="bg-status-problema/10 border border-status-problema/30 rounded-xl px-4 py-3 text-status-problema text-sm">
                  {serverError}
                </div>
              )}

              <div className="flex gap-3 mt-1">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn-primary flex-1">
                  {createMutation.isPending ? <Spinner size="sm" /> : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
