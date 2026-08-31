import { setDefaultResultOrder } from 'node:dns';
import { config } from './config';
import app from './app';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { verificarSmtp } from './lib/mailer';

/**
 * IPv4 primeiro nas conexões de saída que passam por `dns.lookup`.
 *
 * O container do Render não tem rota IPv6 de saída: qualquer serviço externo
 * com registro AAAA que o Node prefira por IPv6 morre em `ENETUNREACH`. Isto
 * era o padrão do Node até a versão 17 — não é truque, é voltar ao que
 * funcionava.
 *
 * O que esta linha **não** resolve é o e-mail, e foi essa a lição: o Nodemailer
 * resolve o host por conta própria, com `resolve4`/`resolve6`, e nunca chega
 * aqui. O contorno de lá mora em `lib/mailer.ts`. Fica de rede de proteção para
 * o resto — Prisma, Supabase Storage — que usa o caminho normal.
 */
setDefaultResultOrder('ipv4first');

async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('Banco de dados conectado');

    // Confere o SMTP agora, e não no primeiro cadastro de alguém.
    //
    // Senha de app revogada é a falha mais provável aqui, e sem esta checagem
    // ela só apareceria quando um usuário tentasse criar conta — em produção,
    // na cara dele. Não segura a subida: o resto da API não depende de e-mail,
    // e ficar fora do ar inteiro porque o Gmail recusou seria trocar um defeito
    // por um pior. O que ela faz é gritar no log, na hora certa.
    void verificarSmtp();

    app.listen(config.port, () => {
      logger.info(
        { port: config.port, env: config.nodeEnv },
        `Viston API ouvindo na porta ${config.port}`
      );
    });
  } catch (err) {
    logger.fatal({ err }, 'Falha ao iniciar servidor');
    process.exit(1);
  }
}

/**
 * Erro que escapou de tudo.
 *
 * Sem estes dois, uma promessa rejeitada sem `catch` derruba o processo com o
 * rastro indo para o stderr cru — no Render, isso é uma reinicialização sem
 * explicação nenhuma no painel.
 */
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Promessa rejeitada sem tratamento');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Exceção não capturada — encerrando');
  process.exit(1);
});

bootstrap();
