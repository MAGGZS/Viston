// Mesma escolha de arquivo do src/config.ts. O `dotenv/config` puro lia apenas
// `.env`, que em desenvolvimento não existe — e as suítes quebravam na carga de
// src/lib/prisma.ts, que lê DATABASE_URL no import.
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, envFile) });
