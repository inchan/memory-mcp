# @memory-mcp/index-search

SQLite FTS5 기반 전문 검색과 링크 그래프를 결합한 하이브리드 검색 엔진입니다. 고성능 텍스트 검색, 백링크 관리, 연결된 노트 탐색 기능을 제공합니다.

## ✨ 주요 기능

### 🔍 **FTS 전문 검색 (FtsSearchEngine)**
- **SQLite FTS5**: BM25 점수 기반 관련성 순 검색
- **한글/영문 혼재**: 다국어 토큰화 및 부분 일치 지원
- **스니펫 생성**: 하이라이팅된 검색 결과 미리보기
- **필터링**: 카테고리, 태그, 프로젝트별 결과 필터링

### 🕸️ **링크 그래프 (LinkGraphManager)**
- **백링크 추적**: 노트 간 양방향 링크 관계 관리
- **그래프 탐색**: 깊이 제한 연결 노트 탐색
- **링크 강도**: 언급 빈도 기반 링크 가중치
- **고아 노트**: 연결되지 않은 노트 탐지

### ⚡ **하이브리드 검색 (SearchEngine)**
- **점수 결합**: FTS(70%) + 링크 그래프(30%) 가중 평균
- **성능 메트릭**: 검색 시간, 결과 수 등 상세 통계
- **배치 인덱싱**: 대량 노트 효율적 처리
- **실시간 갱신**: 노트 변경 시 자동 인덱스 업데이트

### 🗄️ **데이터베이스 관리 (DatabaseManager)**
- **WAL 모드**: 동시성 및 성능 최적화
- **스키마 마이그레이션**: 버전 관리 및 자동 업그레이드
- **VACUUM 최적화**: 정기적 데이터베이스 압축
- **무결성 검사**: 데이터 일관성 보장

## 📦 설치

```bash
npm install @memory-mcp/index-search
```

## 🚀 사용법

### 기본 검색 엔진 설정

```typescript
import {
  createDefaultSearchEngine,
  createSearchEngine
} from '@memory-mcp/index-search';

// 기본 설정으로 검색 엔진 생성
const searchEngine = createDefaultSearchEngine('/path/to/index.db');

// 커스텀 설정으로 검색 엔진 생성
const customEngine = createSearchEngine({
  dbPath: '/path/to/index.db',
  tokenizer: 'unicode61',
  pageSize: 4096,
  cacheSize: 10000,
  walMode: true
});
```

### 하이브리드 검색

```typescript
// 기본 검색
const result = await searchEngine.search('프로젝트 관리', {
  limit: 10,
  offset: 0,
  snippetLength: 200,
  highlightTag: 'mark'
});

console.log(`${result.results.length}개 결과, ${result.metrics.totalTimeMs}ms`);

// 필터링 검색
const filteredResult = await searchEngine.search('개발', {
  category: 'Projects',
  tags: ['programming', 'web'],
  project: 'new-app',
  limit: 5
});

// 검색 결과 처리
result.results.forEach((item, index) => {
  console.log(`${index + 1}. ${item.title} (점수: ${item.score.toFixed(2)})`);
  console.log(`   카테고리: ${item.category}`);
  console.log(`   스니펫: ${item.snippet}`);
  console.log(`   링크: ${item.links?.length || 0}개`);
});
```

### 노트 인덱싱

```typescript
import type { MarkdownNote } from '@memory-mcp/common';

// 단일 노트 인덱싱
await searchEngine.indexNote(note);

// 노트 업데이트
note.content = '업데이트된 내용...';
await searchEngine.indexNote(note); // 자동으로 기존 인덱스 업데이트

// 노트 삭제
await searchEngine.removeNote('note-uid');

// 배치 인덱싱
const notes: MarkdownNote[] = [/* 노트 배열 */];
const batchResult = await searchEngine.indexNotes(notes);

console.log(`성공: ${batchResult.successful}개, 실패: ${batchResult.failed}개`);
console.log(`처리 시간: ${batchResult.totalTimeMs}ms`);
```

### 링크 그래프 탐색

```typescript
// 백링크 검색
const backlinks = await searchEngine.findBacklinks('target-note-id', {
  limit: 20,
  contextLines: 3
});

backlinks.forEach(link => {
  console.log(`${link.sourceUid} → ${link.targetUid} (강도: ${link.strength})`);
});

// 연결된 노트 탐색
const connectedNotes = await searchEngine.findConnectedNotes('start-note-id', {
  depth: 2,
  limit: 50,
  direction: 'both' // 'outgoing', 'incoming', 'both'
});

connectedNotes.forEach(node => {
  console.log(`${node.title} (깊이: ${node.depth}, 점수: ${node.score})`);
});

// 고아 노트 찾기
const orphans = await searchEngine.findOrphanNotes(10);
console.log(`고아 노트 ${orphans.length}개 발견`);
```

### FTS 엔진 직접 사용

```typescript
import { FtsSearchEngine, DatabaseManager } from '@memory-mcp/index-search';

// 데이터베이스 설정
const dbManager = new DatabaseManager({
  dbPath: '/path/to/index.db',
  tokenizer: 'unicode61',
  walMode: true
});

const ftsEngine = new FtsSearchEngine(dbManager.getDatabase());

// FTS 검색
const ftsResult = await ftsEngine.searchNotes('키워드', {
  limit: 10,
  category: 'Resources',
  tags: ['important'],
  snippetLength: 150
});

// 인덱스 최적화
ftsEngine.optimize();

// 인덱스 재구축
ftsEngine.rebuild();
```

### 링크 그래프 직접 관리

```typescript
import { LinkGraphManager } from '@memory-mcp/index-search';

const linkGraph = new LinkGraphManager(database);

// 노트 링크 관계 업데이트
await linkGraph.updateNoteLinks(note, ['linked-note-1', 'linked-note-2']);

// 아웃바운드 링크 조회
const outbound = await linkGraph.findOutboundLinks('source-note-id', 20);

// 링크 통계
const stats = linkGraph.getLinkStats();
console.log(`총 링크: ${stats.totalLinks}개`);
console.log(`평균 링크 수: ${stats.averageLinksPerNote}개`);
console.log('가장 많이 링크된 노트:', stats.mostLinkedNotes);
```

## 🏗️ 아키텍처

### 검색 플로우

```
사용자 쿼리 → SearchEngine → FtsSearchEngine (텍스트 검색)
                          → LinkGraphManager (링크 분석)
                          → 점수 결합 및 재정렬
                          → EnhancedSearchResult
```

### 데이터베이스 스키마

```sql
-- 노트 메타데이터
CREATE TABLE notes (
  uid TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  project TEXT,
  tags TEXT, -- JSON 배열
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FTS5 가상 테이블
CREATE VIRTUAL TABLE notes_fts USING fts5(
  uid UNINDEXED,
  title,
  content,
  tags,
  category UNINDEXED,
  project UNINDEXED
);

-- 링크 관계
CREATE TABLE links (
  source_uid TEXT NOT NULL,
  target_uid TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'internal',
  strength INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_uid, target_uid, link_type)
);
```

## ⚙️ 설정 옵션

### IndexConfig
```typescript
interface IndexConfig {
  dbPath: string;                    // 데이터베이스 파일 경로
  tokenizer?: 'unicode61' | 'ascii' | 'porter'; // FTS 토크나이저
  pageSize?: number;                 // 페이지 크기 (기본: 4096)
  cacheSize?: number;                // 캐시 크기 KB (기본: 10000)
  walMode?: boolean;                 // WAL 모드 (기본: true)
}
```

### SearchOptions
```typescript
interface SearchOptions {
  limit?: number;          // 결과 제한 (기본: 50)
  offset?: number;         // 결과 오프셋 (기본: 0)
  category?: string;       // 카테고리 필터
  tags?: string[];         // 태그 필터
  project?: string;        // 프로젝트 필터
  snippetLength?: number;  // 스니펫 길이 (기본: 150)
  highlightTag?: string;   // 하이라이트 태그 (기본: 'mark')
}
```

### ConnectedNotesOptions
```typescript
interface ConnectedNotesOptions {
  depth?: number;                              // 탐색 깊이 (기본: 2)
  limit?: number;                              // 결과 제한 (기본: 100)
  direction?: 'outgoing' | 'incoming' | 'both'; // 링크 방향 (기본: 'both')
}
```

## 🎯 검색 결과 형식

### SearchResult
```typescript
interface SearchResult {
  id: string;           // 노트 UID
  title: string;        // 노트 제목 (하이라이팅 포함)
  category: string;     // PARA 카테고리
  snippet: string;      // 하이라이팅된 내용 스니펫
  score: number;        // 결합된 검색 점수 (0-1)
  filePath: string;     // 파일 경로
  tags: string[];       // 태그 배열
  links: string[];      // 연결된 노트 UID 배열
}
```

### EnhancedSearchResult
```typescript
interface EnhancedSearchResult {
  results: SearchResult[];    // 검색 결과 배열
  metrics: SearchMetrics;     // 성능 메트릭
  totalCount: number;         // 총 결과 수 (페이징용)
}

interface SearchMetrics {
  queryTimeMs: number;        // 쿼리 실행 시간
  processingTimeMs: number;   // 결과 처리 시간
  totalTimeMs: number;        // 총 처리 시간
  totalResults: number;       // 매칭된 총 결과 수
  returnedResults: number;    // 반환된 결과 수
  cacheHit: boolean;          // 캐시 히트 여부
}
```

## ⚡ 성능 특징

### 검색 성능
- **FTS5 최적화**: BM25 알고리즘으로 관련성 순 정렬
- **인덱스 캐싱**: 10MB 기본 캐시로 반복 검색 가속화
- **WAL 모드**: 읽기/쓰기 동시성 향상
- **배치 처리**: 대량 인덱싱 시 메모리 효율성

### 확장성
- **점진적 인덱싱**: 변경된 노트만 업데이트
- **동시성 제한**: 시스템 리소스 보호
- **최적화 도구**: VACUUM, 인덱스 재빌드 지원

## 🔧 유지보수

### 인덱스 최적화
```typescript
// 정기적 최적화 (권장: 주 1회)
await searchEngine.optimize();

// 무결성 검사
const isValid = searchEngine.checkIntegrity();
if (!isValid) {
  console.error('데이터베이스 무결성 문제 발견');
}

// 통계 조회
const stats = searchEngine.getStats();
console.log('데이터베이스 크기:', stats.indexSize, 'bytes');
console.log('총 노트:', stats.database.totalNotes, '개');
console.log('총 링크:', stats.links.totalLinks, '개');
```

### 트러블슈팅
```typescript
// 인덱스 재빌드 (문제 발생 시)
const ftsEngine = new FtsSearchEngine(database);
ftsEngine.rebuild();

// 손상된 링크 정리
const linkGraph = new LinkGraphManager(database);
await linkGraph.removeNoteLinks('deleted-note-id');
```

## 🧪 테스트

```bash
# 테스트 실행
npm test

# 감시 모드
npm run test:watch

# 커버리지
npm run test:coverage
```

## 📄 라이선스

MIT License

## 🤝 기여

이슈 리포트나 풀 리퀘스트를 환영합니다. 검색 성능 개선이나 새로운 검색 기능에 대한 제안을 기다립니다.