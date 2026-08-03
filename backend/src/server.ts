import { config } from './config';
import app from './app';
import { prisma } from './lib/prisma';

async function bootstrap() {
  try {
    await prisma.$connect();
    console.log('✅ Banco de dados conectado');

    app.listen(config.port, () => {
      console.log(`🚀 Viston API rodando em http://localhost:${config.port}`);
      console.log(`   Ambiente: ${config.nodeEnv}`);
    });
  } catch (err) {
    console.error('❌ Falha ao iniciar servidor:', err);
    process.exit(1);
  }
}

bootstrap();
