module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
      '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
    },
    moduleNameMapper: {
      '^vscode$': '<rootDir>/src/test/__mocks__/vscode.js',
    },
    collectCoverage: true,
    collectCoverageFrom: ['src/**/*.{ts,js}', '!src/test/**/*'],
    coverageReporters: ['json', 'lcov', 'text', 'clover'],
  };
  