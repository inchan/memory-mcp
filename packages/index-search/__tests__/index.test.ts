/**
 * Index-search 패키지 기본 기능 테스트
 */

import { PACKAGE_VERSION } from '../src';

describe('@memory-mcp/index-search', () => {
  test('패키지 버전이 정의되어 있어야 함', () => {
    expect(PACKAGE_VERSION).toBe('0.1.0');
  });

  // TODO: FTS 및 검색 기능이 구현되면 추가 테스트 작성
  test.skip('FTS 인덱스 생성', () => {
    // 구현 예정
  });

  test.skip('전문 검색 수행', () => {
    // 구현 예정
  });

  test.skip('링크 그래프 구축', () => {
    // 구현 예정
  });
});