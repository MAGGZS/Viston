jest.mock('../repositories/usage.repository');

import { usageRepository } from '../repositories/usage.repository';
import { usageService, currentPeriod } from '../services/usage.service';

const mockUsageRepo = usageRepository as jest.Mocked<typeof usageRepository>;

const MANAGER_ID = 'm1111111-1111-4111-8111-111111111111';
const BUILDING_ID = '11111111-1111-4111-8111-111111111111';

const url = (nome: string) => `https://projeto.supabase.co/storage/v1/object/public/viston-photos/${nome}`;

beforeEach(() => {
  jest.clearAllMocks();
  mockUsageRepo.createPhotoAssets.mockResolvedValue({ count: 0 } as never);
  mockUsageRepo.deletePhotoAssets.mockResolvedValue({ count: 0 } as never);
  mockUsageRepo.incrementEmails.mockResolvedValue({} as never);
  mockUsageRepo.sumPhotoBytes.mockResolvedValue(0n);
  mockUsageRepo.findCounter.mockResolvedValue(null);
});

describe('currentPeriod', () => {
  it('é o mês do calendário, no formato YYYY-MM', () => {
    // 15 de setembro de 2026, meio-dia em São Paulo.
    expect(currentPeriod(new Date('2026-09-15T15:00:00.000Z'))).toBe('2026-09');
  });

  it('usa o fuso do produto, e não o do servidor', () => {
    // 1º de outubro às 01:00 UTC ainda é 30 de setembro às 22:00 em São Paulo.
    // Pelo relógio do servidor, o envio dessa hora cairia no mês seguinte e o
    // teto de setembro nunca fecharia direito.
    expect(currentPeriod(new Date('2026-10-01T01:00:00.000Z'))).toBe('2026-09');
  });
});

describe('usageService.recordPhotos', () => {
  it('guarda o caminho do objeto, e não a URL', async () => {
    await usageService.recordPhotos(BUILDING_ID, [
      { url: url('ticket_t1_123.jpg'), bytes: 2048 },
    ]);

    expect(mockUsageRepo.createPhotoAssets).toHaveBeenCalledWith([
      { building_id: BUILDING_ID, path: 'ticket_t1_123.jpg', bytes: 2048 },
    ]);
  });

  it('descarta o que não é URL, e conta o resto', async () => {
    await usageService.recordPhotos(BUILDING_ID, [
      { url: 'nem-url-isso-é', bytes: 10 },
      { url: url('ticket_t1_456.png'), bytes: 4096 },
    ]);

    expect(mockUsageRepo.createPhotoAssets).toHaveBeenCalledWith([
      { building_id: BUILDING_ID, path: 'ticket_t1_456.png', bytes: 4096 },
    ]);
  });

  it('sem foto nenhuma não vai ao banco', async () => {
    await usageService.recordPhotos(BUILDING_ID, []);

    expect(mockUsageRepo.createPhotoAssets).not.toHaveBeenCalled();
  });

  it('falha da contagem não derruba quem enviou a foto', async () => {
    mockUsageRepo.createPhotoAssets.mockRejectedValue(new Error('banco fora'));

    await expect(
      usageService.recordPhotos(BUILDING_ID, [{ url: url('ticket_t1_789.jpg'), bytes: 1 }])
    ).resolves.toBeUndefined();
  });
});

describe('usageService.forgetPhotos', () => {
  it('desconta pelas mesmas chaves com que contou', async () => {
    await usageService.forgetPhotos([url('ticket_t1_123.jpg'), url('ticket_t1_456.png')]);

    expect(mockUsageRepo.deletePhotoAssets).toHaveBeenCalledWith([
      'ticket_t1_123.jpg',
      'ticket_t1_456.png',
    ]);
  });

  it('lista sem nenhuma URL válida não vai ao banco', async () => {
    await usageService.forgetPhotos(['', 'isto não é url']);

    expect(mockUsageRepo.deletePhotoAssets).not.toHaveBeenCalled();
  });

  it('falha ao descontar não derruba a remoção', async () => {
    mockUsageRepo.deletePhotoAssets.mockRejectedValue(new Error('banco fora'));

    await expect(usageService.forgetPhotos([url('ticket_t1_123.jpg')])).resolves.toBeUndefined();
  });
});

describe('usageService.recordEmail', () => {
  it('soma um envio ao mês corrente da conta de gestor', async () => {
    await usageService.recordEmail(MANAGER_ID);

    expect(mockUsageRepo.incrementEmails).toHaveBeenCalledWith(MANAGER_ID, currentPeriod(), 1);
  });

  it('falha da contagem não derruba o envio', async () => {
    mockUsageRepo.incrementEmails.mockRejectedValue(new Error('banco fora'));

    await expect(usageService.recordEmail(MANAGER_ID)).resolves.toBeUndefined();
  });
});

describe('usageService — leitura do que já se gastou', () => {
  it('o espaço vem em número, e a soma do banco é BigInt', async () => {
    mockUsageRepo.sumPhotoBytes.mockResolvedValue(21_474_836_480n); // 20 GB

    expect(await usageService.storageUsedBytes(MANAGER_ID)).toBe(21_474_836_480);
  });

  it('conta sem foto nenhuma ocupa zero', async () => {
    expect(await usageService.storageUsedBytes(MANAGER_ID)).toBe(0);
  });

  it('mês sem linha no contador são zero e-mails, e não um erro', async () => {
    expect(await usageService.emailsSent(MANAGER_ID)).toBe(0);
  });

  it('mês com linha devolve o que foi gravado', async () => {
    mockUsageRepo.findCounter.mockResolvedValue({ emails_sent: 37 } as never);

    expect(await usageService.emailsSent(MANAGER_ID, '2026-09')).toBe(37);
    expect(mockUsageRepo.findCounter).toHaveBeenCalledWith(MANAGER_ID, '2026-09');
  });
});
