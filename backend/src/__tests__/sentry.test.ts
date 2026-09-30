jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  isInitialized: jest.fn(() => true),
  withScope: jest.fn((fn: (scope: { setTag: jest.Mock }) => void) => fn({ setTag: jest.fn() })),
  captureException: jest.fn(),
  flush: jest.fn(),
}));

import * as Sentry from '@sentry/node';
import { Request, Response } from 'express';
import { errorHandler } from '../middlewares/errorHandler';
import { initSentry } from '../lib/sentry';
import { NotFoundError } from '../utils/errors';

const mockSentry = Sentry as jest.Mocked<typeof Sentry>;

function responder() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock };
}

beforeEach(() => jest.clearAllMocks());

describe('Sentry', () => {
  it('sem SENTRY_DSN não inicia nada', () => {
    delete process.env.SENTRY_DSN;
    initSentry();
    expect(mockSentry.init).not.toHaveBeenCalled();
  });

  it('com DSN, inicia sem coletar corpo, cabeçalho, cookie nem usuário', () => {
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1';
    initSentry();
    delete process.env.SENTRY_DSN;

    const opts = mockSentry.init.mock.calls[0][0] as Sentry.NodeOptions;
    expect(opts.tracesSampleRate).toBeUndefined();
    expect(opts.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      stackFrameVariables: false,
    });

    const event = opts.beforeSend!(
      {
        request: { data: { password: 'x' }, headers: { authorization: 'Bearer t' }, cookies: {}, query_string: 'k=1' },
        user: { id: '1' },
      } as never,
      {}
    ) as Record<string, any>;
    expect(event.request).toEqual({});
    expect(event.user).toBeUndefined();
  });

  it('o 500 vai ao Sentry', () => {
    const res = responder();
    errorHandler(new Error('quebrou'), { id: 'req-1' } as unknown as Request, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockSentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('erro de entrada (4xx) não vira alerta', () => {
    const res = responder();
    errorHandler(new NotFoundError('Prédio'), {} as Request, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockSentry.captureException).not.toHaveBeenCalled();
  });
});
