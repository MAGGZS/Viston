import nextJest from 'next/jest.js';

/**
 * O frontend não tinha teste nenhum.
 *
 * `next/jest` monta a transformação: o mesmo SWC do build, os mesmos aliases do
 * jsconfig, e o CSS virando módulo vazio. Sem ele, cada `import '@/app/...'`
 * exigiria um mapeamento à mão que envelhece a cada pasta nova.
 */
const createJestConfig = nextJest({ dir: './' });

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: [path.resolve(__dirname, 'jest.setup.js')],
  testMatch: ['<rootDir>/app/**/__tests__/**/*.test.js'],
};

export default createJestConfig(config);
