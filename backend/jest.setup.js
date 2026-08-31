// Mesma escolha de arquivo do src/config.ts. O `dotenv/config` puro lia apenas
// `.env`, que em desenvolvimento não existe — e as suítes quebravam na carga de
// src/lib/prisma.ts, que lê DATABASE_URL no import.
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, envFile) });

// As variáveis de SMTP são obrigatórias em toda parte (ver src/config.ts), e
// `config` carrega no import de quase tudo — sem elas a suíte inteira morre
// antes do primeiro teste.
//
// Sobrescreve o que veio do `.env.local`, e não apenas preenche o que falta: a
// senha de app real da máquina não tem o que fazer dentro de uma suíte. Os
// valores são fictícios de propósito — nenhuma suíte manda e-mail (o mailer é
// mockado), e se uma escapar do mock, o envio falha alto em vez de sair de
// verdade pela conta do Gmail.
process.env.SMTP_HOST = 'smtp.example.invalid';
process.env.SMTP_PORT = '465';
process.env.SMTP_USER = 'teste@example.invalid';
process.env.SMTP_APP_PASSWORD = 'senha-de-teste-nao-usar';
process.env.SMTP_FROM = 'Viston <teste@example.invalid>';
