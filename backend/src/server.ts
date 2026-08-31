import { config } from './config';
import app from './app';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { verificarSmtp } from './lib/mailer';

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
