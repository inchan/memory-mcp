/**
 * Utils 모듈 상세 테스트
 */

import {
  generateUid,
  normalizePath,
  removeExtension,
  parseMarkdownLinks,
  createSnippet,
  maskSensitiveInfo,
  debounce,
  formatFileSize,
  createLogEntry,
} from '../src/utils';
import { logger } from '../src';

describe('Utils Functions', () => {
  describe('generateUid', () => {
    test('UID 형식이 올바른지 확인', () => {
      const uid = generateUid();
      expect(uid).toMatch(/^\d{8}T\d{12}Z$/);
    });

    test('연속 호출 시 다른 UID 생성', () => {
      const uid1 = generateUid();
      const uid2 = generateUid();
      expect(uid1).not.toBe(uid2);
    });

    test('여러 UID 생성 시 모두 다름', () => {
      const uids = Array.from({ length: 10 }, () => generateUid());
      const uniqueUids = new Set(uids);
      expect(uniqueUids.size).toBe(uids.length);
    });
  });

  describe('normalizePath', () => {
    test('백슬래시를 슬래시로 변환', () => {
      expect(normalizePath('path\\to\\file.txt')).toBe('path/to/file.txt');
    });

    test('연속된 슬래시 제거', () => {
      expect(normalizePath('path//to///file.txt')).toBe('path/to/file.txt');
    });

    test('혼합된 경로 구분자 처리', () => {
      expect(normalizePath('path\\to//file\\test.txt')).toBe('path/to/file/test.txt');
    });

    test('이미 정규화된 경로는 그대로', () => {
      expect(normalizePath('path/to/file.txt')).toBe('path/to/file.txt');
    });
  });

  describe('removeExtension', () => {
    test('확장자 제거', () => {
      expect(removeExtension('file.txt')).toBe('file');
      expect(removeExtension('document.md')).toBe('document');
      expect(removeExtension('archive.tar.gz')).toBe('archive.tar');
    });

    test('확장자가 없는 경우', () => {
      expect(removeExtension('filename')).toBe('filename');
    });

    test('경로 포함 파일', () => {
      expect(removeExtension('/path/to/file.txt')).toBe('/path/to/file');
    });
  });

  describe('parseMarkdownLinks', () => {
    test('위키 링크만 있는 경우', () => {
      const content = '텍스트 [[링크1]] 더 많은 텍스트 [[링크2]]';
      expect(parseMarkdownLinks(content)).toEqual(['링크1', '링크2']);
    });

    test('마크다운 링크만 있는 경우', () => {
      const content = '[텍스트1](링크1) 그리고 [텍스트2](링크2)';
      expect(parseMarkdownLinks(content)).toEqual(['링크1', '링크2']);
    });

    test('혼합된 링크 타입', () => {
      const content = '[[위키링크]] [마크다운](마크다운링크) [[또다른위키]]';
      expect(parseMarkdownLinks(content)).toEqual(['위키링크', '마크다운링크', '또다른위키']);
    });

    test('중복 링크 제거', () => {
      const content = '[[중복]] [텍스트](중복) [[중복]]';
      expect(parseMarkdownLinks(content)).toEqual(['중복']);
    });

    test('빈 링크 무시', () => {
      const content = '[[]] [텍스트]() [[유효링크]]';
      expect(parseMarkdownLinks(content)).toEqual(['유효링크']);
    });

    test('링크가 없는 경우', () => {
      const content = '일반 텍스트만 있습니다.';
      expect(parseMarkdownLinks(content)).toEqual([]);
    });
  });

  describe('createSnippet', () => {
    test('짧은 텍스트는 그대로 반환', () => {
      const text = '짧은 텍스트입니다.';
      expect(createSnippet(text, '텍스트', 100)).toBe(text);
    });

    test('긴 텍스트에서 검색어 주변 추출', () => {
      const text = '이것은 매우 긴 텍스트입니다. 여기에 중요한 키워드가 있습니다. 더 많은 내용이 계속됩니다.';
      const snippet = createSnippet(text, '키워드', 30);
      
      expect(snippet).toContain('키워드');
      expect(snippet.length).toBeLessThanOrEqual(34); // 30 + "..." 길이
    });

    test('검색어를 찾을 수 없는 경우', () => {
      const text = '이것은 긴 텍스트입니다만 키워드가 없습니다.';
      const snippet = createSnippet(text, '없는키워드', 20);
      
      expect(snippet.length).toBeLessThanOrEqual(24);
      expect(snippet.endsWith('...')).toBe(true);
    });

    test('검색어가 시작 부분에 있는 경우', () => {
      const text = '키워드로 시작하는 긴 텍스트입니다. 더 많은 내용이 있습니다.';
      const snippet = createSnippet(text, '키워드', 20);
      
      expect(snippet).toContain('키워드');
      expect(snippet.startsWith('키워드')).toBe(true);
    });
  });

  describe('maskSensitiveInfo', () => {
    test('이메일 주소 마스킹', () => {
      const text = '연락처: test@example.com, admin@company.org';
      const masked = maskSensitiveInfo(text);
      expect(masked).toBe('연락처: ***@***.*** admin@***.***');
    });

    test('전화번호 마스킹', () => {
      const text = '전화: 02-1234-5678, 010-9876-5432';
      const masked = maskSensitiveInfo(text);
      expect(masked).toContain('***-****-****');
    });

    test('신용카드 번호 마스킹', () => {
      const text = '카드번호: 1234-5678-9012-3456';
      const masked = maskSensitiveInfo(text);
      expect(masked).toContain('****-****-****-****');
    });

    test('민감정보가 없는 텍스트', () => {
      const text = '일반적인 텍스트입니다.';
      expect(maskSensitiveInfo(text)).toBe(text);
    });

    test('여러 종류의 민감정보 혼합', () => {
      const text = '연락처: test@email.com, 전화: 02-1234-5678';
      const masked = maskSensitiveInfo(text);
      expect(masked).toContain('***@***.***');
      expect(masked).toContain('***-****-****');
    });
  });

  describe('formatFileSize', () => {
    test('바이트 단위 포맷팅', () => {
      expect(formatFileSize(0)).toBe('0.0 B');
      expect(formatFileSize(512)).toBe('512.0 B');
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1.0 MB');
      expect(formatFileSize(1073741824)).toBe('1.0 GB');
    });
  });

  describe('createLogEntry', () => {
    test('기본 로그 엔트리 생성', () => {
      const entry = createLogEntry('info', '테스트 메시지');
      
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('테스트 메시지');
      expect(entry.timestamp).toBeDefined();
      expect(new Date(entry.timestamp)).toBeInstanceOf(Date);
    });

    test('메타데이터가 있는 로그 엔트리', () => {
      const metadata = { userId: 123, action: 'login' };
      const entry = createLogEntry('warn', '로그인 시도', metadata, 'auth', 'authenticate');
      
      expect(entry.metadata).toEqual(metadata);
      expect(entry.component).toBe('auth');
      expect(entry.operation).toBe('authenticate');
    });
  });

  describe('debounce', () => {
    jest.useFakeTimers();

    afterEach(() => {
      jest.clearAllTimers();
    });

    test('디바운스 함수 동작', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn('arg1');
      debouncedFn('arg2');
      debouncedFn('arg3');

      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenLastCalledWith('arg3');
    });

    test('디바운스 지연 시간 내 재호출', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn('first');
      jest.advanceTimersByTime(50);
      debouncedFn('second');
      jest.advanceTimersByTime(50);

      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledWith('second');
    });
  });

  describe('logger', () => {
    test('로거 객체 존재 확인', () => {
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.debug).toBeDefined();
    });

    // 실제 로깅 테스트는 출력을 검증하기 어려우므로 스킵
    test.skip('로그 출력 테스트', () => {
      // 통합 테스트에서 구현
    });
  });
});