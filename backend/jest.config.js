/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterFramework: [],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/prisma/seed.ts',
    '!src/server.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};
