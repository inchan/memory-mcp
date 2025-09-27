# @memory-mcp/common

Memory MCP 시스템의 공통 스키마, 타입, 유틸리티 함수들을 제공하는 패키지입니다.

## 주요 기능

- **스키마 정의**: Front Matter, PARA 카테고리, 검색 쿼리 등의 Zod 스키마
- **타입 정의**: TypeScript 타입 정의들
- **유틸리티 함수**: UID 생성, 경로 정규화, 링크 파싱, 민감정보 마스킹 등
- **에러 처리**: 표준 에러 코드와 에러 클래스들

## 설치

```bash
npm install @memory-mcp/common
```

## 사용법

```typescript
import {
  generateUid,
  FrontMatterSchema,
  PARA_CATEGORIES,
  MemoryMcpError,
  ErrorCode
} from '@memory-mcp/common';

// UID 생성
const uid = generateUid(); // "20250927T103000Z"

// Front Matter 검증
const frontMatter = {
  id: uid,
  title: '제목',
  category: 'Resources',
  // ...
};

const validated = FrontMatterSchema.parse(frontMatter);
```

## API 문서

### 스키마

- `FrontMatterSchema`: YAML Front Matter 스키마
- `UidSchema`: UID 형식 검증
- `ParaCategorySchema`: PARA 카테고리 검증
- `SearchQuerySchema`: 검색 쿼리 스키마

### 유틸리티

- `generateUid()`: 현재 시간 기반 UID 생성
- `parseMarkdownLinks()`: 마크다운 링크 파싱
- `maskSensitiveInfo()`: 민감정보 마스킹
- `createSnippet()`: 검색 스니펫 생성
- `normalizePath()`: 플랫폼 독립 경로 정규화
- `formatFileSize()`: 파일 크기 포맷팅
- `createLogEntry()`: 구조화된 로그 엔트리 생성

### 에러 처리

- `MemoryMcpError`: 기본 에러 클래스
- `FileSystemError`: 파일 시스템 에러
- `ValidationError`: 스키마 검증 에러
- `ProtocolError`: MCP 프로토콜 에러
- `IndexError`: 인덱스 관련 에러
- `createErrorFromCode()`: 에러 코드 기반 에러 생성 헬퍼
- `isMemoryMcpError()`: 에러 인스턴스 판별 유틸리티
- `formatError()`: 로깅/표시용 문자열 포맷터
