const request = require('supertest');
const bcrypt = require('bcryptjs');

// Mock Prisma
jest.mock('../src/utils/prisma', () => ({
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  inspectionReport: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  floorFormEntry: {
    upsert: jest.fn(),
    filter: jest.fn(),
  },
}));

jest.mock('../src/utils/storage', () => ({
  uploadFile: jest.fn().mockResolvedValue('https://storage.example.com/file.pdf'),
}));

jest.mock('../src/services/pdf.service', () => ({
  generatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
}));

jest.mock('../src/services/excel.service', () => ({
  generateExcel: jest.fn().mockResolvedValue(Buffer.from('xlsx')),
}));

process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.FRONTEND_URL = 'http://localhost:3000';

const app = require('../src/server');
const prisma = require('../src/utils/prisma');
const { signAccessToken } = require('../src/utils/tokens');

const makeToken = (role = 'INSPECTOR', sub = 'user-1') => signAccessToken({ sub, role });

describe('POST /api/auth/login', () => {
  it('returns tokens on valid credentials', async () => {
    const hash = await bcrypt.hash('password123', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', name: 'Test', email: 'test@test.com',
      passwordHash: hash, role: 'INSPECTOR', status: 'ACTIVE', avatarUrl: null,
    });

    const res = await request(app).post('/api/auth/login').send({ email: 'test@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('returns 401 on wrong password', async () => {
    const hash = await bcrypt.hash('correct', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', passwordHash: hash, status: 'ACTIVE',
    });

    const res = await request(app).post('/api/auth/login').send({ email: 'test@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for deleted user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'DELETED' });
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'pass' });
    expect(res.status).toBe(401);
  });
});

describe('RBAC — POST /api/users (ADMIN only)', () => {
  it('returns 403 for INSPECTOR', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${makeToken('INSPECTOR')}`)
      .send({ name: 'New', email: 'new@test.com', password: '123456', role: 'VIEWER' });
    expect(res.status).toBe(403);
  });

  it('returns 201 for ADMIN', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-2', name: 'New', email: 'new@test.com', role: 'VIEWER', status: 'ACTIVE', createdAt: new Date(),
    });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${makeToken('ADMIN')}`)
      .send({ name: 'New User', email: 'new@test.com', password: '123456', role: 'VIEWER' });
    expect(res.status).toBe(201);
  });
});

describe('Soft delete — DELETE /api/users/me', () => {
  it('anonymizes user data', async () => {
    prisma.user.update.mockResolvedValue({ id: 'user-1', name: 'Usuário removido', status: 'DELETED' });

    const res = await request(app)
      .delete('/api/users/me')
      .set('Authorization', `Bearer ${makeToken('INSPECTOR', 'user-1')}`);

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Usuário removido', status: 'DELETED' }),
      })
    );
  });
});

describe('POST /api/inspections/:id/finish', () => {
  it('returns 400 if not all floors completed', async () => {
    prisma.inspectionReport.findUnique.mockResolvedValue({
      id: 'report-1',
      inspectorId: 'user-1',
      status: 'IN_PROGRESS',
      floorsInspected: ['floor-1', 'floor-2'],
      floorEntries: [{ completedAt: new Date(), floor: {}, items: [] }], // only 1 of 2
      inspector: { name: 'Test' },
      building: { name: 'Building', floors: [] },
    });

    const res = await request(app)
      .post('/api/inspections/report-1/finish')
      .set('Authorization', `Bearer ${makeToken('INSPECTOR', 'user-1')}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/andares/i);
  });
});
