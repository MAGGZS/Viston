// Primeiro import do server.ts: o Sentry precisa estar de pé antes de o resto
// do app carregar, para que um erro já na carga dos módulos também seja visto.
import { initSentry } from './lib/sentry';

initSentry();
