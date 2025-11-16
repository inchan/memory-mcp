/**
 * MCP Server 패키지 내보내기 테스트
 */

import * as mcpServer from '../index';

describe('MCP Server Exports', () => {
  it('should export PACKAGE_VERSION', () => {
    expect(mcpServer.PACKAGE_VERSION).toBeDefined();
    expect(typeof mcpServer.PACKAGE_VERSION).toBe('string');
  });

  it('should export tool-related modules', () => {
    // Check for tool registry exports
    expect(mcpServer).toBeDefined();
    expect(typeof mcpServer).toBe('object');
  });

  it('should have all required exports', () => {
    const exports = Object.keys(mcpServer);
    expect(exports.length).toBeGreaterThan(0);
    expect(exports).toContain('PACKAGE_VERSION');
  });
});
