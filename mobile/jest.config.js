// Unit tests cover the pure logic (command payload building, status mapping) only,
// so a plain ts-jest/node setup is enough — no React Native test harness needed.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: { strict: true, esModuleInterop: true, skipLibCheck: true },
    },
  },
}
