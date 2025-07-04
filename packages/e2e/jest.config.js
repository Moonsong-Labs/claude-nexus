/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          moduleResolution: 'NodeNext',
          module: 'NodeNext',
        },
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  globalSetup: '<rootDir>/src/setup/global-setup.ts',
  globalTeardown: '<rootDir>/src/setup/global-teardown.ts',
  testTimeout: 30000,
}
