import {
  generateUid,
  normalizePath,
  parseMarkdownLinks,
  createSnippet,
  maskSensitiveInfo,
  UidSchema,
  FrontMatterSchema,
  PARA_CATEGORIES,
  ErrorCode,
  MemoryMcpError,
} from '../src';

describe('@memory-mcp/common', () => {
  describe('UID generation', () => {
    it('generateUid()는 유효한 UID 형식을 생성해야 한다', () => {
      const uid = generateUid();
      expect(UidSchema.safeParse(uid).success).toBe(true);
      expect(uid).toMatch(/^\d{8}T\d{12}Z$/);
    });

    it('연속된 UID는 서로 달라야 한다', () => {
      const uid1 = generateUid();
      const uid2 = generateUid();
      expect(uid1).not.toBe(uid2);
    });
  });

  describe('Path utilities', () => {
    it('normalizePath()는 경로를 정규화해야 한다', () => {
      expect(normalizePath('path\\to\\file')).toBe('path/to/file');
      expect(normalizePath('path//to///file')).toBe('path/to/file');
    });
  });

  describe('Markdown link parsing', () => {
    it('위키 링크를 파싱해야 한다', () => {
      const content = '이것은 [[링크1]]과 [[링크2]]를 포함한다.';
      const links = parseMarkdownLinks(content);
      expect(links).toEqual(['링크1', '링크2']);
    });

    it('마크다운 링크를 파싱해야 한다', () => {
      const content = '이것은 [텍스트](링크1)와 [다른텍스트](링크2)를 포함한다.';
      const links = parseMarkdownLinks(content);
      expect(links).toEqual(['링크1', '링크2']);
    });

    it('중복 링크를 제거해야 한다', () => {
      const content = '[[링크1]] [텍스트](링크1) [[링크1]]';
      const links = parseMarkdownLinks(content);
      expect(links).toEqual(['링크1']);
    });
  });

  describe('Snippet creation', () => {
    it('검색어 주변의 스니펫을 생성해야 한다', () => {
      const content = '이것은 긴 텍스트입니다. 여기에 검색어가 있습니다. 더 많은 텍스트가 계속됩니다.';
      const snippet = createSnippet(content, '검색어', 20);
      expect(snippet).toContain('검색어');
      expect(snippet.length).toBeLessThanOrEqual(26); // 20 + "..." 길이
    });
  });

  describe('Sensitive info masking', () => {
    it('이메일을 마스킹해야 한다', () => {
      const text = '내 이메일은 test@example.com입니다.';
      const masked = maskSensitiveInfo(text);
      expect(masked).toBe('내 이메일은 ***@***.***입니다.');
    });

    it('전화번호를 마스킹해야 한다', () => {
      const text = '전화번호: 02-1234-5678';
      const masked = maskSensitiveInfo(text);
      expect(masked).toBe('전화번호: ***-****-****');
    });
  });

  describe('Schemas', () => {
    it('PARA 카테고리가 올바르게 정의되어야 한다', () => {
      expect(PARA_CATEGORIES).toEqual(['Projects', 'Areas', 'Resources', 'Archives']);
    });

    it('유효한 FrontMatter를 검증해야 한다', () => {
      const validFrontMatter = {
        id: '20250927T103000123456Z',
        title: '테스트 노트',
        category: 'Resources',
        tags: ['test'],
        created: '2025-09-27T10:30:00Z',
        updated: '2025-09-27T10:30:00Z',
        links: [],
      };

      const result = FrontMatterSchema.safeParse(validFrontMatter);
      expect(result.success).toBe(true);
    });
  });

  describe('Errors', () => {
    it('MemoryMcpError를 올바르게 생성해야 한다', () => {
      const error = new MemoryMcpError(
        ErrorCode.FILE_NOT_FOUND,
        '파일을 찾을 수 없습니다',
        { filePath: '/test/path' }
      );

      expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
      expect(error.message).toBe('파일을 찾을 수 없습니다');
      expect(error.metadata).toEqual({ filePath: '/test/path' });
    });

    it('에러를 JSON으로 직렬화할 수 있어야 한다', () => {
      const error = new MemoryMcpError(ErrorCode.INTERNAL_ERROR, '내부 에러');
      const json = error.toJSON();

      expect(json.name).toBe('MemoryMcpError');
      expect(json.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(json.message).toBe('내부 에러');
    });
  });
});