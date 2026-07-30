import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto } from './users.dto';
import { Role, UserStatus } from '@prisma/client';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('E-mail já cadastrado');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash, role: dto.role },
      select: USER_SELECT,
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    if (dto.email) {
      const exists = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id: userId } },
      });
      if (exists) throw new ConflictException('E-mail já em uso');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: USER_SELECT,
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Senha atual incorreta');

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Senha alterada com sucesso' };
  }

  async softDeleteMe(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: 'Usuário removido',
        email: `deleted_${userId}@removed.com`,
        avatarUrl: null,
        status: UserStatus.DELETED,
      },
    });
    return { message: 'Conta removida com sucesso' };
  }

  async updateRole(id: string, role: Role) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.prisma.user.update({ where: { id }, data: { role }, select: USER_SELECT });
  }

  async updateStatus(id: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (status === UserStatus.DELETED) {
      return this.prisma.user.update({
        where: { id },
        data: {
          name: 'Usuário removido',
          email: `deleted_${id}@removed.com`,
          avatarUrl: null,
          status: UserStatus.DELETED,
        },
        select: USER_SELECT,
      });
    }

    return this.prisma.user.update({ where: { id }, data: { status }, select: USER_SELECT });
  }
}
