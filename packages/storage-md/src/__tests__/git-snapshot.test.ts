/**
 * GitSnapshotManager 테스트
 */

import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import { GitSnapshotManager } from '../git-snapshot';
import { FileWatchEventData, GitSnapshotResult } from '../types';

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

const mockExecFile = jest.requireMock('child_process').execFile as jest.Mock;

jest.mock('util', () => ({
  promisify: jest.fn((fn) => fn),
}));

// Mock dependencies
jest.mock('../file-operations');
jest.mock('@memory-mcp/common', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  maskSensitiveInfo: jest.fn((text) => text),
}));

import * as fileOperations from '../file-operations';

// 임시 테스트 디렉토리
const TEMP_DIR = path.join(__dirname, '../../temp-git-test');

describe('GitSnapshotManager', () => {
  let manager: GitSnapshotManager;

  beforeEach(async () => {
    // 임시 디렉토리 생성
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // Mock clear
    jest.clearAllMocks();
    mockExecFile.mockClear();

    // Mock implementations
    (fileOperations.normalizePath as jest.Mock).mockImplementation((p) => p);

    manager = new GitSnapshotManager(TEMP_DIR);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEMP_DIR, { recursive: true, force: true });
    } catch (error) {
      // 무시 - 테스트 디렉토리가 없을 수 있음
    }
  });

  describe('생성자 및 설정', () => {
    test('기본 설정으로 GitSnapshotManager 생성', () => {
      const manager = new GitSnapshotManager(TEMP_DIR);

      expect(manager).toBeInstanceOf(GitSnapshotManager);
    });

    test('커스텀 설정으로 GitSnapshotManager 생성', () => {
      const options = {
        mode: 'tag' as const,
        commitMessageTemplate: 'snapshot: {count} files',
        tagTemplate: 'v{timestamp}',
        retries: 3,
        gitBinary: 'custom-git',
        metricsCollector: jest.fn()
      };

      const manager = new GitSnapshotManager(TEMP_DIR, options);

      expect(manager).toBeInstanceOf(GitSnapshotManager);
    });
  });

  describe('초기화', () => {
    test('Git 저장소에서 초기화 성공', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: TEMP_DIR, stderr: '' }) // rev-parse --show-toplevel
        .mockResolvedValueOnce({ stdout: 'abc123', stderr: '' }); // rev-parse --verify HEAD

      await manager.initialize();

      expect(mockExecFile).toHaveBeenCalledWith('git', ['rev-parse', '--show-toplevel'], { cwd: TEMP_DIR });
      expect(mockExecFile).toHaveBeenCalledWith('git', ['rev-parse', '--verify', 'HEAD'], { cwd: TEMP_DIR });
    });

    test('Git 저장소가 아닌 곳에서 초기화 실패', async () => {
      mockExecFile.mockRejectedValueOnce({ code: 128, stderr: 'not a git repository' });

      await expect(manager.initialize()).rejects.toThrow('Git 저장소가 아님');
    });

    test('HEAD가 없는 저장소에서 초기화', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: TEMP_DIR, stderr: '' }) // rev-parse --show-toplevel
        .mockRejectedValueOnce({ code: 1, stderr: 'bad revision' }); // rev-parse --verify HEAD

      await manager.initialize();

      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });

    test('이미 초기화된 상태에서 재초기화', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: TEMP_DIR, stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123', stderr: '' });

      await manager.initialize();
      await manager.initialize(); // 두 번째 호출

      expect(mockExecFile).toHaveBeenCalledTimes(2); // 첫 번째 초기화만 실행됨
    });
  });

  describe('스냅샷 생성', () => {
    const mockEvents: FileWatchEventData[] = [
      {
        type: 'change',
        filePath: path.join(TEMP_DIR, 'note1.md')
      },
      {
        type: 'add',
        filePath: path.join(TEMP_DIR, 'note2.md')
      }
    ];

    beforeEach(async () => {
      // 초기화 Mock
      mockExecFile
        .mockResolvedValueOnce({ stdout: TEMP_DIR, stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123', stderr: '' });

      await manager.initialize();
      jest.clearAllMocks();
    });

    test('정상적인 스냅샷 생성 (commit 모드)', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git add
        .mockResolvedValueOnce({ stdout: 'M  note1.md\nA  note2.md\n', stderr: '' }) // git status --porcelain
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git commit
        .mockResolvedValueOnce({ stdout: 'def456', stderr: '' }); // git rev-parse HEAD

      const result = await manager.createSnapshot(mockEvents);

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(result?.mode).toBe('commit');
      expect(result?.commitSha).toBe('def456');
      expect(result?.changedFiles).toHaveLength(2);
    });

    test('스냅샷 생성 (tag 모드)', async () => {
      const tagManager = new GitSnapshotManager(TEMP_DIR, { mode: 'tag' });

      // 초기화
      mockExecFile
        .mockResolvedValueOnce({ stdout: TEMP_DIR, stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123', stderr: '' });

      await tagManager.initialize();
      jest.clearAllMocks();

      mockExecFile
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git add
        .mockResolvedValueOnce({ stdout: 'M  note1.md\n', stderr: '' }) // git status --porcelain
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git commit
        .mockResolvedValueOnce({ stdout: 'def456', stderr: '' }) // git rev-parse HEAD
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git tag

      const result = await tagManager.createSnapshot(mockEvents);

      expect(result?.success).toBe(true);
      expect(result?.mode).toBe('tag');
      expect(result?.tagName).toBeDefined();
    });

    test('비활성화 모드에서는 null 반환', async () => {
      const disabledManager = new GitSnapshotManager(TEMP_DIR, { mode: 'disabled' });

      // 초기화
      mockExecFile
        .mockResolvedValueOnce({ stdout: TEMP_DIR, stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123', stderr: '' });

      await disabledManager.initialize();

      const result = await disabledManager.createSnapshot(mockEvents);

      expect(result).toBeNull();
    });

    test('초기화되지 않은 상태에서 스냅샷 생성 시 에러', async () => {
      const uninitializedManager = new GitSnapshotManager(TEMP_DIR);

      await expect(uninitializedManager.createSnapshot(mockEvents)).rejects.toThrow(
        'GitSnapshotManager가 초기화되지 않았습니다'
      );
    });

    test('변경된 파일이 없는 경우', async () => {
      const emptyEvents: FileWatchEventData[] = [];

      const result = await manager.createSnapshot(emptyEvents);

      expect(result).toBeNull();
    });

    test('스테이징된 변경사항이 없는 경우', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git add
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git status --porcelain (빈 결과)

      const result = await manager.createSnapshot(mockEvents);

      expect(result?.success).toBe(true);
      expect(result?.message).toBe('No staged changes to snapshot');
    });

    test('저장소 외부 파일은 제외', async () => {
      // Mock fs.realpathSync가 없어서 fallback 경로 사용
      const outsideEvents: FileWatchEventData[] = [
        {
          type: 'change',
          filePath: '/outside/repo/file.md'
        }
      ];

      const result = await manager.createSnapshot(outsideEvents);

      expect(result).toBeNull();
    });
  });

  describe('에러 처리 및 재시도', () => {
    beforeEach(async () => {
      // 초기화 Mock
      mockExecFile
        .mockResolvedValueOnce({ stdout: TEMP_DIR, stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123', stderr: '' });

      await manager.initialize();
      jest.clearAllMocks();
    });

    test('Git 명령 실패 시 재시도', async () => {
      const events: FileWatchEventData[] = [
        { type: 'change', filePath: path.join(TEMP_DIR, 'note.md') }
      ];

      mockExecFile
        .mockRejectedValueOnce(new Error('네트워크 오류')) // 첫 번째 시도 실패
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // 두 번째 시도 성공
        .mockResolvedValueOnce({ stdout: 'M  note.md\n', stderr: '' }) // git status
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git commit
        .mockResolvedValueOnce({ stdout: 'def456', stderr: '' }); // git rev-parse

      const result = await manager.createSnapshot(events);

      expect(result?.success).toBe(true);
      expect(mockExecFile).toHaveBeenCalledTimes(5); // 재시도 포함
    });

    test('최대 재시도 횟수 초과 시 에러', async () => {
      const events: FileWatchEventData[] = [
        { type: 'change', filePath: path.join(TEMP_DIR, 'note.md') }
      ];

      mockExecFile.mockRejectedValue(new Error('지속적인 네트워크 오류'));

      await expect(manager.createSnapshot(events)).rejects.toThrow('Git 스냅샷 작업 실패');
    });

    test('스냅샷 실패 시 롤백', async () => {
      const events: FileWatchEventData[] = [
        { type: 'change', filePath: path.join(TEMP_DIR, 'note.md') }
      ];

      mockExecFile
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git add
        .mockResolvedValueOnce({ stdout: 'M  note.md\n', stderr: '' }) // git status
        .mockRejectedValueOnce(new Error('커밋 실패')) // git commit 실패
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git reset (롤백)

      await expect(manager.createSnapshot(events)).rejects.toThrow('커밋 실패');

      // 롤백이 호출되었는지 확인
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['reset', '--mixed', 'HEAD'],
        { cwd: TEMP_DIR }
      );
    });
  });

  describe('유틸리티 메서드', () => {
    test('고유 파일 목록 추출', () => {
      const events: FileWatchEventData[] = [
        { type: 'change', filePath: path.join(TEMP_DIR, 'note1.md') },
        { type: 'change', filePath: path.join(TEMP_DIR, 'note1.md') }, // 중복
        { type: 'add', filePath: path.join(TEMP_DIR, 'note2.md') },
      ];

      // private 메서드 테스트를 위한 타입 캐스팅
      const uniqueFiles = (manager as any).collectUniqueFiles(events);

      expect(uniqueFiles).toHaveLength(2);
      expect(uniqueFiles).toContain('note1.md');
      expect(uniqueFiles).toContain('note2.md');
    });

    test('템플릿 렌더링', () => {
      // private 메서드 테스트
      const template = 'chore: {count} files updated at {timestamp}';
      const rendered = (manager as any).renderTemplate(template, 5);

      expect(rendered).toContain('5 files updated');
      expect(rendered).toContain('chore:');
    });

    test('커밋 SHA가 포함된 템플릿 렌더링', () => {
      const template = 'tag-{commit}-{timestamp}';
      const rendered = (manager as any).renderTemplate(template, undefined, 'abc123');

      expect(rendered).toContain('abc123');
      expect(rendered).toContain('tag-');
    });
  });

  describe('메트릭 수집', () => {
    test('메트릭 콜렉터 호출', async () => {
      const metricsCollector = jest.fn();
      const managerWithMetrics = new GitSnapshotManager(TEMP_DIR, {
        metricsCollector
      });

      // 초기화
      mockExecFile
        .mockResolvedValueOnce({ stdout: TEMP_DIR, stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123', stderr: '' });

      await managerWithMetrics.initialize();
      jest.clearAllMocks();

      const events: FileWatchEventData[] = [
        { type: 'change', filePath: path.join(TEMP_DIR, 'note.md') }
      ];

      mockExecFile
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git add
        .mockResolvedValueOnce({ stdout: 'M  note.md\n', stderr: '' }) // git status
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git commit
        .mockResolvedValueOnce({ stdout: 'def456', stderr: '' }); // git rev-parse

      await managerWithMetrics.createSnapshot(events);

      expect(metricsCollector).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          mode: 'commit',
          durationMs: expect.any(Number)
        })
      );
    });

    test('실패한 스냅샷의 메트릭 수집', async () => {
      const metricsCollector = jest.fn();
      const managerWithMetrics = new GitSnapshotManager(TEMP_DIR, {
        metricsCollector
      });

      // 초기화
      mockExecFile
        .mockResolvedValueOnce({ stdout: TEMP_DIR, stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123', stderr: '' });

      await managerWithMetrics.initialize();
      jest.clearAllMocks();

      const events: FileWatchEventData[] = [
        { type: 'change', filePath: path.join(TEMP_DIR, 'note.md') }
      ];

      mockExecFile
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git add
        .mockResolvedValueOnce({ stdout: 'M  note.md\n', stderr: '' }) // git status
        .mockRejectedValue(new Error('커밋 실패')); // git commit 실패

      try {
        await managerWithMetrics.createSnapshot(events);
      } catch (error) {
        // 예상된 에러
      }

      expect(metricsCollector).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorCode: expect.any(String),
          durationMs: expect.any(Number)
        })
      );
    });
  });

  describe('파일 경로 처리', () => {
    test('저장소 내 상대 경로 확인', () => {
      // private 메서드 테스트
      const manager = new GitSnapshotManager(TEMP_DIR);
      (manager as any).repositoryRoot = TEMP_DIR;

      const absolutePath = path.join(TEMP_DIR, 'subfolder', 'note.md');
      const relativePath = (manager as any).ensureRelativeToRepo(absolutePath);

      expect(relativePath).toBe('subfolder/note.md');
    });

    test('저장소 외부 파일은 null 반환', () => {
      const manager = new GitSnapshotManager(TEMP_DIR);
      (manager as any).repositoryRoot = TEMP_DIR;

      const outsidePath = '/outside/repo/note.md';
      const relativePath = (manager as any).ensureRelativeToRepo(outsidePath);

      expect(relativePath).toBeNull();
    });
  });
});