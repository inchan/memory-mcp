/**
 * 버전 정보 테스트
 */

import { PACKAGE_VERSION } from '../src/version';

describe('Version', () => {
  test('패키지 버전이 정의되어 있어야 함', () => {
    expect(PACKAGE_VERSION).toBe('0.1.0');
    expect(typeof PACKAGE_VERSION).toBe('string');
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});