/**
 * 인덱싱 속도 성능 테스트
 * KPI: 증분 색인 < 3초
 */

import { executeTool } from '../../src/tools';
import { createTestContext, cleanupTestContext } from '../test-helpers';
import type { ToolExecutionContext } from '../../src/tools/types';

describe('Indexing Speed Performance Tests', () => {
  let context: ToolExecutionContext;

  beforeEach(() => {
    context = createTestContext();
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  it('단일 노트 증분 인덱싱이 빠르게 완료되어야 함', async () => {
    const startTime = Date.now();

    await executeTool(
      'create_note',
      {
        title: 'Indexing Test',
        content: 'This note should be indexed quickly.',
        tags: ['indexing', 'performance'],
      },
      context
    );

    const indexingTime = Date.now() - startTime;

    console.log(`\n단일 노트 인덱싱 시간: ${indexingTime}ms`);

    // 단일 노트는 훨씬 빨라야 함
    expect(indexingTime).toBeLessThan(1000); // 1초 이내
  });

  it('배치 노트 생성 시 인덱싱 성능', async () => {
    const batchSize = 10;
    const startTime = Date.now();

    for (let i = 0; i < batchSize; i++) {
      await executeTool(
        'create_note',
        {
          title: `Batch Note ${i}`,
          content: `Content for batch note ${i}`,
          tags: ['batch', 'indexing'],
        },
        context
      );
    }

    const totalTime = Date.now() - startTime;
    const avgTimePerNote = totalTime / batchSize;

    console.log(`\n배치 인덱싱 성능:`);
    console.log(`  노트 수: ${batchSize}개`);
    console.log(`  총 시간: ${totalTime}ms`);
    console.log(`  평균 시간/노트: ${avgTimePerNote.toFixed(2)}ms`);

    // 평균 인덱싱 시간이 합리적인지 확인
    expect(avgTimePerNote).toBeLessThan(500); // 노트당 500ms 이내
  });

  it('노트 업데이트 시 재인덱싱 성능', async () => {
    // 노트 생성
    const createResult = await executeTool(
      'create_note',
      {
        title: 'Original',
        content: 'Original content for update test',
      },
      context
    );

    const uid = createResult._meta?.metadata?.uid;

    // 업데이트 및 재인덱싱 시간 측정
    const startTime = Date.now();

    await executeTool(
      'update_note',
      {
        uid,
        title: 'Updated Title',
        content: 'Updated content that needs to be reindexed',
        tags: ['updated', 'reindexed'],
      },
      context
    );

    const reindexingTime = Date.now() - startTime;

    console.log(`\n재인덱싱 시간: ${reindexingTime}ms`);

    // 재인덱싱이 빠르게 완료되어야 함
    expect(reindexingTime).toBeLessThan(1000); // 1초 이내
  });
});
