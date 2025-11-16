module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/__tests__/**',
    '!packages/*/src/**/*.test.ts',
    '!packages/*/src/**/*.spec.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 27,      // 현재: 27.7% → 임계값: 27% (기존 25%에서 소폭 상향)
      functions: 40,     // 현재: 46.07% → 임계값: 40% (기존 25%에서 상향)
      lines: 45,         // 현재: 46.07% → 임계값: 45% (기존 30%에서 상향)
      statements: 45     // 현재: 45.95% → 임계값: 45% (기존 30%에서 상향)
    },
    // 핵심 기능은 높은 커버리지 유지
    'packages/mcp-server/src/tools': {
      branches: 70,      // 현재: 74.28% → 유지
      functions: 70,     // 현재: 75.6% → 유지
      lines: 80,         // 현재: 85.07% → 유지
      statements: 80     // 현재: 84.96% → 유지
    }
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@inchankang/zettel-memory-(.*)$': '<rootDir>/packages/$1/src'
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  resolver: '<rootDir>/jest.resolver.cjs',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '\\.d\\.ts$',
    '/setup\\.ts$',
    '/test-helpers\\.ts$'
  ]
};
