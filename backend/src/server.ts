import { setDefaultResultOrder } from 'node:dns';
import { config } from './config';
import app from './app';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { verificarSmtp } from './lib/mailer';

/**
 * IPv4 primeiro, em todas as conexões de saída do processo.
 *
 * `smtp.gmail.com` responde em IPv4 e IPv6, e o Node 17+ passou a preferir o
 * que o sistema devolver primeiro — que no Render é o IPv6. O container não tem
 * rota IPv6 de saída, então a conexão morria em
 * `ENETUNREACH 2607:f8b0:...:465`, antes de qualquer byte de SMTP.
 *
 * Na máquina de quem desenvolve isso não aparece, porque lá o IPv6 costuma
 * funcionar: é um defeito que só existe do lado de lá, e por isso atravessou
 * todos os testes até chegar em produção.
 *
 * Vale para todo o processo, e não só para o e-mail, de propósito: qualquer
 * serviço externo com AAAA no DNS cairia no mesmo buraco. `ipv4first` era o
 * padrão do Node até a versão 17 — não é um truque, é voltar ao que funcionava.
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
