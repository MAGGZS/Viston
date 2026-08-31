import { setDefaultResultOrder } from 'node:dns';
import { config } from './config';
import app from './app';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { verificarProvedorEmail } from './lib/mailer';

/**
 * IPv4 primeiro em todas as conexões de saída do processo.
 *
 * O container do Render não tem rota IPv6 de saída: qualquer host com registro
 * AAAA que o Node prefira por IPv6 morre em `ENETUNREACH`. Foi assim que o
 * envio de e-mail quebrou quando ainda era SMTP, e vale igual para a API da
 * Brevo, para o Supabase e para qualquer serviço externo que ganhe um AAAA
 * amanhã.
 *
 * Era o padrão do Node até a versão 17 — não é truque, é voltar ao que
 * funcionava numa rede sem IPv6.
 */
setDefaultResultOrder('ipv4first');

async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('Banco de dados conectado');

    // Confere o provedor de e-mail agora, e não no primeiro cadastro de alguém.
    //
    // Chave revogada é a falha mais provável aqui, e sem esta checagem ela só
    // apareceria quando um usuário tentasse criar conta — em produção, na cara
    // dele. Não segura a subida: o resto da API não depende de e-mail, e ficar
    // fora do ar inteiro porque o provedor recusou seria trocar um defeito por
    // um pior. O que ela faz é gritar no log, na hora certa.
    void verificarProvedorEmail();

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
