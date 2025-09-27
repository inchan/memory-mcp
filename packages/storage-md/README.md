# @memory-mcp/storage-md

Markdown 파일 저장/로드와 Front Matter 처리를 위한 패키지입니다. 원자적 파일 쓰기, 실시간 파일 감시, 백링크 자동 관리, PARA 구조 관리 기능을 제공합니다.

## ✨ 주요 기능

### 📁 **파일 운영**
- **원자적 쓰기**: 임시 파일 + rename으로 데이터 손실 방지
- **재시도 메커니즘**: 지수 백오프로 일시적 오류 처리
- **경로 정규화**: OS 호환성 보장
- **안전한 파일명**: 특수문자 자동 처리
- **편의 API**: `safeRead`, `atomicWrite`, `getFileInfo`, `listMarkdownFiles`

### 👁️ **파일 감시 (VaultWatcher)**
- **실시간 감지**: chokidar 기반 파일 변경 감지
- **디바운싱**: 중복 이벤트 방지
- **배치 처리**: 대량 파일 변경 효율적 처리
- **필터링**: 마크다운 파일만 선별적 감시

### 🔗 **백링크 자동 관리 (BacklinkManager)**
- **자동 파싱**: 마크다운 링크 자동 추출
- **실시간 동기화**: 파일 변경 시 백링크 자동 갱신
- **배치 동기화**: 전체 볼트 백링크 재빌드
- **정리 기능**: 삭제된 노트의 백링크 자동 정리

### 📂 **PARA 구조 관리 (ParaManager)**
- **자동 분류**: Projects/Areas/Resources/Archives 구조
- **스마트 이동**: 프로젝트 상태에 따른 자동 카테고리 이동
- **아카이브**: 오래된 노트 자동 아카이브
- **프로젝트 관리**: 프로젝트별 서브디렉토리 자동 생성

## 📦 설치

```bash
npm install @memory-mcp/storage-md
```

## 🚀 사용법

### 기본 노트 관리

```typescript
import {
  createNewNote,
  saveNote,
  loadNote,
  findNoteByUid
} from '@memory-mcp/storage-md';

// 새 노트 생성
const note = createNewNote(
  '프로젝트 아이디어',
  '새로운 앱 개발 계획...',
  '/vault/Projects/new-app.md',
  'Projects',
  {
    tags: ['development', 'mobile'],
    project: 'new-app',
    links: ['existing-note-id']
  }
);

// 파일 저장 (원자적)
await saveNote(note);

// 노트 로드
const loadedNote = await loadNote('/vault/Projects/new-app.md');

// UID로 노트 찾기
const foundNote = await findNoteByUid('20250927T103000Z', '/vault');
```

### 파일 유틸리티

```typescript
import {
  safeRead,
  atomicWrite,
  getFileInfo,
  listMarkdownFiles,
  validateFrontMatter
} from '@memory-mcp/storage-md';

// 안전하게 파일 읽기
const contents = await safeRead('/vault/Projects/design.md');

// 원자적으로 파일 쓰기
await atomicWrite('/vault/Projects/design.md', '# 새 디자인 안건', {
  createDirs: true
});

// 파일 메타데이터 확인
const info = await getFileInfo('/vault/Projects/design.md');
console.log(info.size, info.created, info.modified);

// 마크다운 파일 목록 조회
const files = await listMarkdownFiles('/vault', { recursive: true });
files.forEach(file => console.log(file.path));

// Front Matter 유효성 검사
validateFrontMatter({
  id: '20250927T103000123456Z',
  title: '검증용 노트',
  category: 'Resources',
  tags: [],
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  links: []
});
```

### 파일 감시 설정

```typescript
import { createVaultWatcher } from '@memory-mcp/storage-md';

const watcher = createVaultWatcher('/vault', {
  pattern: '**/*.md',
  ignored: ['**/node_modules/**', '**/.git/**'],
  debounceMs: 300
});

// 이벤트 리스너 등록
watcher.onFileChange((eventData) => {
  console.log(`파일 ${eventData.type}: ${eventData.filePath}`);
  if (eventData.note) {
    console.log(`노트 제목: ${eventData.note.frontMatter.title}`);
  }
});

// 감시 시작
await watcher.start();

// 감시 중지
await watcher.stop();
```

### 백링크 자동 관리

```typescript
import { createBacklinkManager } from '@memory-mcp/storage-md';

const backlinkManager = createBacklinkManager('/vault', {
  autoSync: true,
  debounceMs: 1000,
  batchSize: 10
});

// 파일 감시자와 연동
await backlinkManager.initialize(watcher);

// 백링크 동기화 이벤트
backlinkManager.onBacklinkSync((event) => {
  console.log(`백링크 ${event.type}: ${event.targetUid}`);
  console.log(`영향받은 노트: ${event.affectedNotes.length}개`);
});

// 전체 백링크 재빌드
await backlinkManager.rebuildAllBacklinks();

// 특정 노트 백링크 동기화
await backlinkManager.syncBacklinksForNote('note-uid');
```

### PARA 구조 관리

```typescript
import { createParaManager } from '@memory-mcp/storage-md';

const paraManager = createParaManager({
  rootPath: '/vault',
  directories: {
    Projects: '1-Projects',
    Areas: '2-Areas',
    Resources: '3-Resources',
    Archives: '4-Archives'
  },
  autoMove: true,
  createProjectSubdirs: true,
  archiveThresholdDays: 90
});

// PARA 구조 초기화
await paraManager.initialize();

// 노트 자동 정리
const newPath = await paraManager.organizeNote(note);

// 오래된 노트 아카이브
const archivedNotes = await paraManager.archiveOldNotes();

// 프로젝트 완료 시 아카이브
const projectNotes = await paraManager.archiveProject('completed-project');

// 통계 조회
const stats = await paraManager.getStats();
console.log(`Projects: ${stats.Projects}개, Resources: ${stats.Resources}개`);
```

### 고급 노트 분석

```typescript
import {
  analyzeLinks,
  generateNoteMetadata,
  createExtendedNote
} from '@memory-mcp/storage-md';

// 링크 분석
const linkAnalysis = await analyzeLinks(note, '/vault');
console.log(`아웃바운드 링크: ${linkAnalysis.outboundLinks.length}개`);
console.log(`백링크: ${linkAnalysis.inboundLinks.length}개`);
console.log(`깨진 링크: ${linkAnalysis.brokenLinks.length}개`);

// 메타데이터 생성
const metadata = await generateNoteMetadata(note);
console.log(`파일 크기: ${metadata.fileSize} bytes`);
console.log(`단어 수: ${metadata.wordCount}개`);

// 확장된 노트 정보
const extendedNote = await createExtendedNote(note, '/vault');
```

## 🏗️ 아키텍처

### 핵심 모듈

- **`file-operations.ts`**: 원자적 파일 I/O, 재시도 로직
- **`front-matter.ts`**: YAML Front Matter 파싱/직렬화
- **`note-manager.ts`**: 노트 CRUD, 링크 분석, 메타데이터
- **`watcher.ts`**: 파일 시스템 감시, 이벤트 처리
- **`backlink-manager.ts`**: 백링크 자동 관리, 동기화
- **`para-manager.ts`**: PARA 구조 관리, 자동 분류

### 데이터 플로우

```
파일 변경 → VaultWatcher → BacklinkManager → 링크 분석 → Front Matter 업데이트
               ↓
           ParaManager → 카테고리 분석 → 자동 이동/아카이브
```

## 🔧 설정 옵션

### VaultWatchOptions
```typescript
interface VaultWatchOptions {
  pattern?: string;        // 감시할 파일 패턴 (기본: "**/*.md")
  ignored?: string[];      // 무시할 패턴들
  debounceMs?: number;     // 디바운스 시간 (기본: 300ms)
  recursive?: boolean;     // 재귀적 감시 (기본: true)
}
```

### BacklinkManagerOptions
```typescript
interface BacklinkManagerOptions {
  autoSync?: boolean;      // 자동 동기화 (기본: true)
  debounceMs?: number;     // 디바운스 시간 (기본: 1000ms)
  batchSize?: number;      // 배치 크기 (기본: 10)
  concurrency?: number;    // 동시 처리 수 (기본: 5)
}
```

### ParaStructureConfig
```typescript
interface ParaStructureConfig {
  rootPath: string;                           // 루트 디렉토리
  directories: Record<ParaCategory, string>;  // 카테고리별 디렉토리
  autoMove?: boolean;                         // 자동 이동 (기본: true)
  createProjectSubdirs?: boolean;             // 프로젝트 서브디렉토리 (기본: true)
  archiveThresholdDays?: number;              // 아카이브 임계값 (기본: 90일)
}
```

## 🎯 Front Matter 스키마

```yaml
---
id: "20250927T103000Z"           # 타임스탬프 기반 UID
title: "노트 제목"
category: "Projects"             # PARA 카테고리
tags: ["tag1", "tag2"]          # 분류 태그
project: "project-name"         # 프로젝트 연결 (선택)
created: "2025-09-27T10:30:00Z"
updated: "2025-09-27T10:30:00Z"
links: ["other-note-id"]        # 연결된 노트들 (자동 관리)
---
```

## ⚡ 성능 특징

- **배치 처리**: 대량 파일 처리 시 메모리 효율성
- **디바운싱**: 중복 이벤트 방지로 CPU 사용량 최적화
- **원자적 연산**: 데이터 무결성 보장
- **동시성 제한**: 시스템 리소스 보호

## 🔒 보안 고려사항

- **원자적 쓰기**: 파일 쓰기 중 시스템 장애 시에도 데이터 보호
- **경로 검증**: 디렉토리 트래버설 공격 방지
- **오류 복구**: 포괄적인 예외 처리 및 롤백
- **권한 체크**: 파일 접근 권한 사전 검증

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

이슈 리포트나 풀 리퀘스트를 환영합니다. 주요 변경사항은 먼저 이슈를 열어 논의해주세요.