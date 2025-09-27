// Jest setup file
// Global test configuration and mocks

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods in tests by default
global.console = {
  ...console,
  // Uncomment to ignore console.log in tests
  // log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};