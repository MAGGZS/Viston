// Mesma escolha de arquivo do src/config.ts. O `dotenv/config` puro lia apenas
// `.env`, que em desenvolvimento não existe — e as suítes quebravam na carga de
// src/lib/prisma.ts, que lê DATABASE_URL no import.
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, envFile) });

// As três variáveis de e-mail são obrigatórias em toda parte (ver src/config.ts),
// e `config` carrega no import de quase tudo — sem elas a suíte inteira morre
// antes do primeiro teste.
//
// Os valores são fictícios de propósito, e não os do `.env.local`: nenhuma suíte
// manda e-mail (o cliente do Resend é mockado), e se um dia alguma escapar do
// mock, o envio falha alto em vez de sair de verdade pela conta real.
// Sobrescreve o que veio do `.env.local`, e não apenas preenche o que falta: a
// chave real da máquina não tem o que fazer dentro de uma suíte.
process.env.APP_URL = 'http://localhost:3001';
process.env.RESEND_API_KEY = 're_chave_de_teste_nao_usar';
process.env.EMAIL_FROM = 'Viston <teste@example.invalid>';
