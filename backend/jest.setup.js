// Mesma escolha de arquivo do src/config.ts. O `dotenv/config` puro lia apenas
// `.env`, que em desenvolvimento não existe — e as suítes quebravam na carga de
// src/lib/prisma.ts, que lê DATABASE_URL no import.
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, envFile) });

// As variáveis de e-mail são obrigatórias em toda parte (ver src/config.ts), e
// `config` carrega no import de quase tudo — sem elas a suíte inteira morre
// antes do primeiro teste.
//
// Sobrescreve o que veio do `.env.local`, e não apenas preenche o que falta: a
// chave real da máquina não tem o que fazer dentro de uma suíte. Os valores são
// fictícios de propósito — nenhuma suíte manda e-mail (o mailer é mockado), e
// se uma escapar do mock, a chamada falha alto em vez de sair de verdade pela
// conta da Brevo.
process.env.BREVO_API_KEY = 'chave-de-teste-nao-usar';
process.env.EMAIL_FROM = 'teste@example.invalid';
process.env.EMAIL_FROM_NAME = 'Viston';
