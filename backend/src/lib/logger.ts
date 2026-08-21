import pino from 'pino';
import { config } from '../config';

/**
 * O log do backend.
 *
 * `console.error` era o único mecanismo, e em produção ele vira texto solto no
 * painel do Render: sem nível, sem carimbo de tempo confiável, e sem nada que
 * ligue as linhas de uma mesma requisição. Quando um 500 aparece, o que se
 * quer saber é o que aconteceu *antes* dele, na mesma chamada — e não havia
 * como.
 *
 * `redact` não é enfeite: o cabeçalho `Authorization` carrega o token, e o
 * corpo do login carrega a senha em claro. Log é o lugar clássico onde os dois
 * vazam, porque ninguém espera que vazem ali.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (config.isProduction ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.current_password',
      '*.new_password',
      '*.password_hash',
      '*.refresh_token',
      '*.access_token',
      // A foto de perfil chega como data URL: sem isto, uma linha de log tem
      // um megabyte e meio de base64.
      '*.image',
    ],
    censor: '[oculto]',
  },
  // Em desenvolvimento o JSON puro é ilegível no terminal; em produção ele é
  // exatamente o que um coletor de logs quer.
  ...(config.isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
});
