/**
 * 엔드투엔드 워크플로우 통합 테스트
 * 노트 생성 → 업데이트 → 검색 → 삭제
 */

import { executeTool } from '../../src/tools';
import { createTestContext, cleanupTestContext } from '../test-helpers';
import type { ToolExecutionContext } from '../../src/tools/types';

describe('End-to-End Workflow Tests', () => {
  let context: ToolExecutionContext;

  beforeEach(() => {
    context = createTestContext();
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  describe('기본 CRUD 워크플로우', () => {
    it('노트 생성 → 읽기 → 업데이트 → 읽기 → 삭제 전체 플로우', async () => {
      // 1. 노트 생성
      const createResult = await executeTool(
        'create_note',
        {
          title: 'E2E Test Note',
          content: '# Initial Content\n\nThis is the initial version.',
          category: 'Projects',
          tags: ['e2e', 'test'],
        },
        context
      );

      const uid = createResult._meta?.metadata?.uid;
      expect(uid).toBeDefined();
      expect(createResult.content[0]?.text).toContain('성공');

      // 2. 노트 읽기
      const readResult1 = await executeTool('read_note', { uid }, context);
      expect(readResult1.content[0]?.text).toContain('E2E Test Note');
      expect(readResult1.content[0]?.text).toContain('Initial Content');

      // 3. 노트 업데이트
      const updateResult = await executeTool(
        'update_note',
        {
          uid,
          title: 'Updated E2E Note',
          content: '# Updated Content\n\nThis has been modified.',
          tags: ['e2e', 'test', 'updated'],
        },
        context
      );
      expect(updateResult.content[0]?.text).toContain('업데이트');

      // 4. 업데이트된 노트 읽기
      const readResult2 = await executeTool('read_note', { uid }, context);
      expect(readResult2.content[0]?.text).toContain('Updated E2E Note');
      expect(readResult2.content[0]?.text).toContain('Updated Content');
      expect(readResult2.content[0]?.text).not.toContain('Initial Content');

      // 5. 노트 삭제
      const deleteResult = await executeTool(
        'delete_note',
        { uid, confirm: true },
        context
      );
      expect(deleteResult.content[0]?.text).toContain('삭제');

      // 6. 삭제된 노트는 읽을 수 없음
      await expect(
        executeTool('read_note', { uid }, context)
      ).rejects.toThrow();
    });
  });

  describe('검색 워크플로우', () => {
    it('노트 생성 → 검색 → 결과 확인', async () => {
      // 1. 여러 노트 생성
      await executeTool(
        'create_note',
        {
          title: 'JavaScript Guide',
          content: 'Learn JavaScript programming',
          tags: ['javascript', 'programming'],
        },
        context
      );

      await executeTool(
        'create_note',
        {
          title: 'Python Tutorial',
          content: 'Python programming basics',
          tags: ['python', 'programming'],
        },
        context
      );

      await executeTool(
        'create_note',
        {
          title: 'React Documentation',
          content: 'React library for building UIs',
          tags: ['javascript', 'react'],
        },
        context
      );

      // 2. 검색 실행
      const searchResult = await executeTool(
        'search_memory',
        { query: 'JavaScript' },
        context
      );

      expect(searchResult.content[0]?.type).toBe('text');
      const text = searchResult.content[0]?.text || '';
      expect(text).toContain('JavaScript') || expect(text).toContain('javascript');
    });

    it('노트 생성 → 리스트 조회 → 필터링', async () => {
      // 1. 다양한 카테고리의 노트 생성
      await executeTool(
        'create_note',
        {
          title: 'Project Alpha',
          content: 'Project content',
          category: 'Projects',
        },
        context
      );

      await executeTool(
        'create_note',
        {
          title: 'Resource Beta',
          content: 'Resource content',
          category: 'Resources',
        },
        context
      );

      // 2. 전체 리스트 조회
      const listAllResult = await executeTool('list_notes', {}, context);
      expect(listAllResult.content[0]?.type).toBe('text');

      // 3. 카테고리별 필터링
      const listProjectsResult = await executeTool(
        'list_notes',
        { category: 'Projects' },
        context
      );
      const projectsText = listProjectsResult.content[0]?.text || '';
      expect(projectsText).toContain('Project Alpha');
    });
  });

  describe('복잡한 시나리오', () => {
    it('다중 노트 생성 → 일부 업데이트 → 일부 삭제 → 검색', async () => {
      // 1. 여러 노트 생성
      const note1 = await executeTool(
        'create_note',
        { title: 'Note 1', content: 'Content 1', tags: ['tag1'] },
        context
      );
      const uid1 = note1._meta?.metadata?.uid;

      const note2 = await executeTool(
        'create_note',
        { title: 'Note 2', content: 'Content 2', tags: ['tag2'] },
        context
      );
      const uid2 = note2._meta?.metadata?.uid;

      const note3 = await executeTool(
        'create_note',
        { title: 'Note 3', content: 'Content 3', tags: ['tag3'] },
        context
      );
      const uid3 = note3._meta?.metadata?.uid;

      // 2. Note 2 업데이트
      await executeTool(
        'update_note',
        { uid: uid2, title: 'Updated Note 2', tags: ['tag2', 'updated'] },
        context
      );

      // 3. Note 3 삭제
      await executeTool('delete_note', { uid: uid3, confirm: true }, context);

      // 4. 리스트 조회 - 2개만 있어야 함
      const listResult = await executeTool('list_notes', {}, context);
      const listText = listResult.content[0]?.text || '';
      expect(listText).toContain('Note 1');
      expect(listText).toContain('Updated Note 2');
      expect(listText).not.toContain('Note 3');

      // 5. 검색 - 업데이트된 노트 확인
      const readResult = await executeTool('read_note', { uid: uid2 }, context);
      expect(readResult.content[0]?.text).toContain('Updated Note 2');
    });

    it('프로젝트 링크 워크플로우', async () => {
      // 1. 프로젝트 노트 생성
      const projectNote = await executeTool(
        'create_note',
        {
          title: 'Project Main',
          content: 'Main project description',
          category: 'Projects',
        },
        context
      );
      const projectUid = projectNote._meta?.metadata?.uid;

      // 2. 프로젝트에 연결된 노트들 생성
      await executeTool(
        'create_note',
        {
          title: 'Task 1',
          content: 'First task',
          category: 'Projects',
          project: 'project-main',
        },
        context
      );

      await executeTool(
        'create_note',
        {
          title: 'Task 2',
          content: 'Second task',
          category: 'Projects',
          project: 'project-main',
        },
        context
      );

      // 3. 프로젝트별 노트 조회
      const listResult = await executeTool(
        'list_notes',
        { project: 'project-main' },
        context
      );

      const text = listResult.content[0]?.text || '';
      expect(text).toContain('Task 1') || expect(text).toContain('Task 2');
    });
  });

  describe('에러 복구 시나리오', () => {
    it('잘못된 업데이트 시도 후 재시도 성공', async () => {
      // 1. 노트 생성
      const createResult = await executeTool(
        'create_note',
        { title: 'Test', content: 'Content' },
        context
      );
      const uid = createResult._meta?.metadata?.uid;

      // 2. 잘못된 업데이트 시도 (빈 제목)
      await expect(
        executeTool('update_note', { uid, title: '' }, context)
      ).rejects.toThrow();

      // 3. 올바른 업데이트
      const updateResult = await executeTool(
        'update_note',
        { uid, title: 'Corrected Title' },
        context
      );
      expect(updateResult.content[0]?.text).toContain('업데이트');

      // 4. 확인
      const readResult = await executeTool('read_note', { uid }, context);
      expect(readResult.content[0]?.text).toContain('Corrected Title');
    });
  });
});
