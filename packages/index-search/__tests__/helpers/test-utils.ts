/**
 * 테스트 유틸리티 함수들
 */

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { MarkdownNote } from '@memory-mcp/common';
import { DatabaseManager, createDefaultConfig } from '../../src/database';
import { IndexConfig } from '../../src/types';

/**
 * 임시 디렉토리 생성
 */
export function createTempDir(): string {
  const tempDir = path.join(__dirname, '..', 'temp', crypto.randomUUID());
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * 임시 데이터베이스 생성
 */
export function createTempDatabase(): {
  dbManager: DatabaseManager;
  dbPath: string;
  cleanup: () => void;
} {
  const tempDir = createTempDir();
  const dbPath = path.join(tempDir, 'test.db');
  const config = createDefaultConfig(dbPath);
  const dbManager = new DatabaseManager(config);

  const cleanup = () => {
    try {
      dbManager.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('cleanup 실패:', error);
    }
  };

  return { dbManager, dbPath, cleanup };
}

/**
 * 테스트용 노트 생성
 */
export function createTestNote(
  overrides: Partial<MarkdownNote['frontMatter']> = {}
): MarkdownNote {
  const id = overrides.id || `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    frontMatter: {
      id,
      title: overrides.title || `테스트 노트 ${id}`,
      category: overrides.category || 'Resources',
      tags: overrides.tags || ['test', 'sample'],
      project: overrides.project,
      created: overrides.created || new Date().toISOString(),
      updated: overrides.updated || new Date().toISOString(),
      links: overrides.links || []
    },
    content: overrides.content || `# ${overrides.title || `테스트 노트 ${id}`}

이것은 테스트용 노트입니다.

## 내용

- 첫 번째 항목
- 두 번째 항목
- 세 번째 항목

## 링크

[[다른-노트]]와 연결됩니다.

## 코드 예제

\`\`\`javascript
function test() {
  return "Hello World";
}
\`\`\`

## 마크다운 문법

**굵은 글씨**와 *기울임꼴*을 사용할 수 있습니다.
`,
    filePath: `/test/notes/${id}.md`
  };
}

/**
 * 여러 테스트 노트 생성
 */
export function createTestNotes(count: number): MarkdownNote[] {
  const notes: MarkdownNote[] = [];

  for (let i = 0; i < count; i++) {
    notes.push(createTestNote({
      id: `test-note-${i.toString().padStart(3, '0')}`,
      title: `테스트 노트 ${i + 1}`,
      category: i % 4 === 0 ? 'Projects' : i % 4 === 1 ? 'Areas' : i % 4 === 2 ? 'Resources' : 'Archives',
      tags: [
        'test',
        i % 3 === 0 ? 'important' : i % 3 === 1 ? 'draft' : 'review',
        `tag-${i % 5}`
      ],
      project: i % 2 === 0 ? `project-${Math.floor(i / 2)}` : undefined
    }));
  }

  return notes;
}

/**
 * 한국어 테스트 노트 생성
 */
export function createKoreanTestNote(): MarkdownNote {
  return createTestNote({
    id: 'korean-test-note',
    title: '한국어 테스트 노트',
    category: 'Resources',
    tags: ['한국어', '테스트', '검색'],
    content: `# 한국어 테스트 노트

## 개요

이 노트는 한국어 전문 검색 기능을 테스트하기 위한 샘플 문서입니다.

## 내용

### 자주 사용되는 단어들

- 프로젝트 관리
- 데이터베이스
- 검색 엔진
- 인공지능
- 머신러닝

### 복합 검색 테스트

React와 TypeScript를 사용한 웹 개발에서는 컴포넌트 기반 아키텍처가 중요합니다.
SQLite FTS5를 활용한 전문 검색 시스템 구축 방법을 알아보겠습니다.

### 특수 문자 포함

이메일: test@example.com
URL: https://example.com/path?param=value
파일경로: /Users/test/documents/file.txt

### 코드 블록

\`\`\`typescript
interface SearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
}
\`\`\`

### 마크다운 링크

[[관련-노트]]와 [외부 링크](https://example.com)를 포함합니다.
`
  });
}

/**
 * 링크 관계가 있는 테스트 노트들 생성
 */
export function createLinkedTestNotes(): MarkdownNote[] {
  const note1 = createTestNote({
    id: 'note-001',
    title: '첫 번째 노트',
    content: `# 첫 번째 노트

이 노트는 [[note-002]]와 [[note-003]]에 연결됩니다.

또한 [[note-004]]도 참조합니다.
`,
    links: ['note-002', 'note-003', 'note-004']
  });

  const note2 = createTestNote({
    id: 'note-002',
    title: '두 번째 노트',
    content: `# 두 번째 노트

[[note-001]]에서 이 노트를 참조합니다.

이 노트는 [[note-003]]과 연결됩니다.
`,
    links: ['note-001', 'note-003']
  });

  const note3 = createTestNote({
    id: 'note-003',
    title: '세 번째 노트',
    content: `# 세 번째 노트

[[note-001]]과 [[note-002]]에서 이 노트를 참조합니다.

독립적인 내용을 가집니다.
`,
    links: ['note-001', 'note-002']
  });

  const note4 = createTestNote({
    id: 'note-004',
    title: '네 번째 노트 (고아)',
    content: `# 네 번째 노트

이 노트는 다른 노트에서 참조되지만 역참조는 없습니다.
`,
    links: []
  });

  return [note1, note2, note3, note4];
}

/**
 * 대용량 테스트 데이터 생성
 */
export function createLargeTestDataset(size: number = 1000): MarkdownNote[] {
  const notes: MarkdownNote[] = [];
  const categories = ['Projects', 'Areas', 'Resources', 'Archives'];
  const tagSets = [
    ['frontend', 'react', 'typescript'],
    ['backend', 'nodejs', 'database'],
    ['devops', 'docker', 'kubernetes'],
    ['ai', 'machine-learning', 'python'],
    ['mobile', 'react-native', 'ios']
  ];

  for (let i = 0; i < size; i++) {
    const category = categories[i % categories.length];
    const tags = tagSets[i % tagSets.length];

    notes.push(createTestNote({
      id: `large-test-${i.toString().padStart(4, '0')}`,
      title: `대용량 테스트 노트 ${i + 1}`,
      category,
      tags,
      project: i % 10 === 0 ? `big-project-${Math.floor(i / 10)}` : undefined,
      content: `# 대용량 테스트 노트 ${i + 1}

## 배경

이 노트는 성능 테스트를 위한 대용량 데이터셋의 일부입니다.
인덱스 번호: ${i}
카테고리: ${category}

## 상세 내용

${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(i % 10 + 1)}

### 기술 스택

${tags.map(tag => `- ${tag}`).join('\n')}

### 관련 링크

${i > 0 ? `[[large-test-${(i - 1).toString().padStart(4, '0')}]]` : ''}
${i < size - 1 ? `[[large-test-${(i + 1).toString().padStart(4, '0')}]]` : ''}

## 결론

노트 ${i + 1}의 내용입니다.
`
    }));
  }

  return notes;
}

/**
 * 테스트 완료 후 정리
 */
export function afterEachCleanup(): void {
  const tempDir = path.join(__dirname, '..', 'temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * 테스트 성능 측정
 */
export class PerformanceTracker {
  private startTime: number = 0;
  private measurements: { [key: string]: number } = {};

  start(): void {
    this.startTime = Date.now();
  }

  mark(label: string): void {
    this.measurements[label] = Date.now() - this.startTime;
  }

  getResult(): { [key: string]: number } {
    return { ...this.measurements };
  }

  getTotalTime(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * 검색 결과 검증 헬퍼
 */
export function validateSearchResult(
  results: any[],
  expectedCount?: number,
  expectedIds?: string[]
): void {
  if (expectedCount !== undefined) {
    expect(results).toHaveLength(expectedCount);
  }

  if (expectedIds) {
    const resultIds = results.map(r => r.uid || r.id);
    expectedIds.forEach(id => {
      expect(resultIds).toContain(id);
    });
  }

  // 기본 구조 검증
  results.forEach(result => {
    expect(result).toHaveProperty('uid');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('score');
    expect(typeof result.score).toBe('number');
  });
}