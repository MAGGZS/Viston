import { Response } from 'express';

export function ok<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json(data);
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json(data);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function errorResponse(
  res: Response,
  statusCode: number,
  code: string,
  message: string
): Response {
  return res.status(statusCode).json({ error: { code, message } });
}
