/**
 * Jest 테스트 환경 설정
 */

// 테스트 환경에서의 로깅 레벨 설정
process.env.NODE_ENV = 'test';

// 타임아웃 설정
jest.setTimeout(10000);

// 글로벌 에러 핸들러
process.on('unhandledRejection', reason => {
  // eslint-disable-next-line no-console
  console.error('Unhandled Promise Rejection:', reason);
});

// Mock 설정이 필요하면 여기에 추가
