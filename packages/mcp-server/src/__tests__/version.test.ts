/**
 * 버전 정보 테스트
 */

import { PACKAGE_VERSION } from '../version';

describe('Package Version', () => {
  it('should export PACKAGE_VERSION constant', () => {
    expect(PACKAGE_VERSION).toBeDefined();
    expect(typeof PACKAGE_VERSION).toBe('string');
  });

  it('should have valid semver format', () => {
    // Basic semver check: X.Y.Z
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should be version 0.1.0', () => {
    expect(PACKAGE_VERSION).toBe('0.1.0');
  });
});
