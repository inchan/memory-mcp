/**
 * index-search 타입 및 에러 클래스 테스트
 *
 * 커버리지 목표: 28.57% → 100%
 */

import {
  IndexSearchError,
  DatabaseError,
  SearchError,
  IndexingError,
} from '../types';

describe('index-search 에러 클래스', () => {
  describe('IndexSearchError', () => {
    it('should create error with message and code', () => {
      const error = new IndexSearchError('Index error occurred', 'INDEX_ERROR');

      expect(error.name).toBe('IndexSearchError');
      expect(error.message).toBe('Index error occurred');
      expect(error.code).toBe('INDEX_ERROR');
      expect(error.details).toBeUndefined();
    });

    it('should create error with details', () => {
      const details = { query: 'test', dbPath: '/index.db' };
      const error = new IndexSearchError('Error', 'CODE', details);

      expect(error.details).toEqual(details);
    });

    it('should be instanceof Error', () => {
      const error = new IndexSearchError('Test', 'TEST_CODE');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(IndexSearchError);
    });

    it('should have stack trace', () => {
      const error = new IndexSearchError('Stack test', 'STACK');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('IndexSearchError');
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Database connection failed');

      expect(error.name).toBe('DatabaseError');
      expect(error.message).toBe('Database connection failed');
      expect(error.code).toBe('DATABASE_ERROR');
    });

    it('should include details', () => {
      const error = new DatabaseError('Query failed', {
        query: 'SELECT * FROM notes',
        errno: 1,
      });

      expect(error.details).toEqual({
        query: 'SELECT * FROM notes',
        errno: 1,
      });
    });

    it('should be instanceof IndexSearchError', () => {
      const error = new DatabaseError('Test');

      expect(error).toBeInstanceOf(IndexSearchError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('SearchError', () => {
    it('should create search error', () => {
      const error = new SearchError('Search query invalid');

      expect(error.name).toBe('SearchError');
      expect(error.message).toBe('Search query invalid');
      expect(error.code).toBe('SEARCH_ERROR');
    });

    it('should include details', () => {
      const error = new SearchError('FTS error', {
        query: 'invalid syntax',
        ftsVersion: 5,
      });

      expect(error.details).toEqual({
        query: 'invalid syntax',
        ftsVersion: 5,
      });
    });

    it('should be instanceof IndexSearchError', () => {
      const error = new SearchError('Test');

      expect(error).toBeInstanceOf(IndexSearchError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('IndexingError', () => {
    it('should create indexing error', () => {
      const error = new IndexingError('Failed to index note');

      expect(error.name).toBe('IndexingError');
      expect(error.message).toBe('Failed to index note');
      expect(error.code).toBe('INDEXING_ERROR');
    });

    it('should include details', () => {
      const error = new IndexingError('Batch indexing failed', {
        noteUid: '20250927T103000Z',
        reason: 'invalid front matter',
      });

      expect(error.details).toEqual({
        noteUid: '20250927T103000Z',
        reason: 'invalid front matter',
      });
    });

    it('should be instanceof IndexSearchError', () => {
      const error = new IndexingError('Test');

      expect(error).toBeInstanceOf(IndexSearchError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('에러 상속 체인', () => {
    it('should maintain proper inheritance chain', () => {
      const dbError = new DatabaseError('DB error');
      const searchError = new SearchError('Search error');
      const indexingError = new IndexingError('Indexing error');

      // All should be instances of Error
      expect(dbError).toBeInstanceOf(Error);
      expect(searchError).toBeInstanceOf(Error);
      expect(indexingError).toBeInstanceOf(Error);

      // All should be instances of IndexSearchError
      expect(dbError).toBeInstanceOf(IndexSearchError);
      expect(searchError).toBeInstanceOf(IndexSearchError);
      expect(indexingError).toBeInstanceOf(IndexSearchError);
    });

    it('should have distinct error names', () => {
      const dbError = new DatabaseError('test');
      const searchError = new SearchError('test');
      const indexingError = new IndexingError('test');

      expect(dbError.name).toBe('DatabaseError');
      expect(searchError.name).toBe('SearchError');
      expect(indexingError.name).toBe('IndexingError');
    });

    it('should have distinct error codes', () => {
      const dbError = new DatabaseError('test');
      const searchError = new SearchError('test');
      const indexingError = new IndexingError('test');

      expect(dbError.code).toBe('DATABASE_ERROR');
      expect(searchError.code).toBe('SEARCH_ERROR');
      expect(indexingError.code).toBe('INDEXING_ERROR');
    });
  });
});
