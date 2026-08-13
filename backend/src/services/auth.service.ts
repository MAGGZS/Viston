import bcrypt from 'bcrypt';
import { userRepository } from '../repositories/user.repository';
import { auditRepository, buildingRepository } from '../repositories/building.repository';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { UnauthorizedError, NotFoundError } from '../utils/errors';
import { AuditAction } from '@prisma/client';

export const authService = {
  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email);
    if (!user || user.status === 'DELETED') {
      throw new UnauthorizedError('Credenciais inválidas');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedError('Credenciais inválidas');

    await auditRepository.log({ user_id: user.id, action: AuditAction.LOGIN });

    // Os vínculos vão junto porque é por eles que o app decide para onde mandar
    // a pessoa logo depois do login — buscá-los num segundo request deixaria a
    // primeira tela decidir sem saber de nada.
    const memberships = await buildingRepository.getUserMemberships(user.id);

    return {
      access_token: signAccessToken(user.id, user.role),
      refresh_token: signRefreshToken(user.id, user.role),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
        memberships,
      },
    };
  },

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    const user = await userRepository.findById(payload.sub);
    if (!user || user.status === 'DELETED') throw new UnauthorizedError('Usuário não encontrado');

    return {
      access_token: signAccessToken(user.id, user.role),
      refresh_token: signRefreshToken(user.id, user.role),
    };
  },
};
