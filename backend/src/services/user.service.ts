import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { userRepository } from '../repositories/user.repository';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';

export const userService = {
  async create(data: { name: string; email: string; password: string; role?: Role }) {
    const existing = await userRepository.findByEmail(data.email);
    if (existing) throw new ConflictError('E-mail já cadastrado');

    // Primeiro usuário do sistema vira ADMIN automaticamente
    const totalUsers = await userRepository.count();
    const role: Role = totalUsers === 0 ? Role.ADMIN : (data.role ?? Role.VIEWER);

    const password_hash = await bcrypt.hash(data.password, 10);
    const user = await userRepository.create({ ...data, role, password_hash });

    const { password_hash: _, ...safe } = user;
    return safe;
  },

  async findAll(page: number, limit: number) {
    const [users, total] = await userRepository.findAll(page, limit);
    return { users, total, page, limit };
  },

  async findById(id: string) {
    const user = await userRepository.findById(id);
    if (!user || user.status === 'DELETED') throw new NotFoundError('Usuário');
    const { password_hash: _, ...safe } = user;
    return safe;
  },

  async update(id: string, data: { role?: Role; status?: 'ACTIVE' | 'DELETED' }) {
    await this.findById(id);
    const updated = await userRepository.update(id, data);
    const { password_hash: _, ...safe } = updated;
    return safe;
  },

  async updateMe(id: string, data: { name?: string; email?: string }) {
    if (data.email) {
      const existing = await userRepository.findByEmail(data.email);
      if (existing && existing.id !== id) throw new ConflictError('E-mail já em uso');
    }
    const updated = await userRepository.update(id, data);
    const { password_hash: _, ...safe } = updated;
    return safe;
  },

  async changePassword(id: string, currentPassword: string, newPassword: string) {
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError('Usuário');

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new UnauthorizedError('Senha atual incorreta');

    const password_hash = await bcrypt.hash(newPassword, 10);
    await userRepository.update(id, { password_hash });
  },

  async softDelete(id: string) {
    await this.findById(id);
    await userRepository.softDelete(id);
  },
};
