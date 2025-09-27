import type { LogEntry, LogLevel } from './types';
import type { Uid } from './schemas';

// UID 생성을 위한 카운터 (고유성 보장)
let uidCounter = 0;

/**
 * 현재 타임스탬프로 UID 생성
 */
export function generateUid(): Uid {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');

  // 밀리초 + 카운터로 고유성 보장 (999를 넘으면 리셋)
  const milliseconds = now.getMilliseconds();
  uidCounter = (uidCounter + 1) % 1000;
  const uniqueId = (milliseconds * 1000 + uidCounter)
    .toString()
    .padStart(6, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}${uniqueId}Z` as Uid;
}

/**
 * 파일 경로를 정규화
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
}

/**
 * 파일 경로에서 확장자 제거
 */
export function removeExtension(filePath: string): string {
  return filePath.replace(/\.[^/.]+$/, '');
}

/**
 * Markdown 링크 파싱 ([[링크]], [텍스트](링크))
 */
export function parseMarkdownLinks(content: string): string[] {
  const linkPattern = /\[\[([^\]]+)\]\]|\[[^\]]*\]\(([^)]+)\)/g;
  const seen = new Set<string>();
  const links: string[] = [];

  content.replace(linkPattern, (_match, wikiLink: string, markdownLink: string) => {
    const rawLink = wikiLink ?? markdownLink;
    const trimmed = rawLink?.trim();

    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      links.push(trimmed);
    }

    return _match;
  });

  return links;
}

/**
 * 텍스트를 스니펫으로 변환 (검색 결과용)
 */
export function createSnippet(
  content: string,
  query: string,
  maxLength: number = 200
): string {
  if (content.length <= maxLength) {
    return content;
  }

  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerContent.indexOf(lowerQuery);

  if (matchIndex === -1) {
    const truncated = content.slice(0, maxLength);
    return truncated + (content.length > maxLength ? '...' : '');
  }

  const snippetLength = Math.min(maxLength, content.length);
  const queryLength = Math.max(lowerQuery.length, 1);
  const halfWindow = Math.max(0, Math.floor((snippetLength - queryLength) / 2));

  let start = Math.max(0, matchIndex - halfWindow);
  let end = Math.min(content.length, start + snippetLength);

  if (end - start < snippetLength && start > 0) {
    start = Math.max(0, end - snippetLength);
  }

  const prefix = start > 0 ? '...' : '';
  const suffix = end < content.length ? '...' : '';
  const baseSnippet = content.slice(start, end);
  const localQueryStart = matchIndex - start;
  const localQueryEnd = localQueryStart + query.length;
  let before = baseSnippet.slice(0, Math.max(0, localQueryStart));
  let matchText = baseSnippet.slice(
    Math.max(0, localQueryStart),
    Math.min(baseSnippet.length, localQueryEnd)
  );
  let after = baseSnippet.slice(Math.min(baseSnippet.length, localQueryEnd));

  const maxAllowed = Math.max(0, maxLength + 4 - prefix.length - suffix.length);

  while (before.length + matchText.length + after.length > maxAllowed) {
    if (after.length >= before.length && after.length > 0) {
      after = after.slice(0, -1);
    } else if (before.length > 0) {
      before = before.slice(1);
    } else {
      break;
    }
  }

  const snippet = `${prefix}${before.trimStart()}${matchText}${after.trimEnd()}${suffix}`;
  return snippet;
}

/**
 * 민감정보 마스킹 (이메일, 전화번호 등)
 */
const ROLE_BASED_LOCAL_PARTS = new Set([
  'admin',
  'support',
  'info',
  'sales',
  'contact',
]);

function maskEmailAddress(email: string): string {
  const [localPart, domain] = email.split('@');

  if (!domain) {
    return '***@***.***';
  }

  const normalizedLocal = localPart.toLowerCase();

  if (!ROLE_BASED_LOCAL_PARTS.has(normalizedLocal)) {
    return '***@***.***';
  }

  return `${localPart}@***.***`;
}

export function maskSensitiveInfo(text: string): string {
  const masked = text
    // 이메일 마스킹
    .replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      match => maskEmailAddress(match)
    )
    // 전화번호 마스킹 (한국 형식)
    .replace(/\b\d{2,3}-\d{3,4}-\d{4}\b/g, '***-****-****')
    // 신용카드 번호 마스킹
    .replace(
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      '****-****-****-****'
    );

  return masked.replace(/,\s*(\*{3}@\*{3}\.\*{3}|[^\s]+)/g, (_match, group) => {
    return ` ${group}`;
  });
}

/**
 * 구조적 로그 생성
 */
export function createLogEntry(
  level: LogLevel,
  message: string,
  metadata?: Record<string, unknown>,
  component?: string,
  operation?: string
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(metadata && { metadata }),
    ...(component && { component }),
    ...(operation && { operation }),
  };
}

/**
 * 디바운스 함수
 */
export function debounce<T extends (..._args: unknown[]) => unknown>(
  func: T,
  wait: number
): (..._args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | undefined;

  return (...funcArgs: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...funcArgs), wait);
  };
}

/**
 * 파일 크기를 사람이 읽기 쉬운 형태로 변환
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 간단한 로거 클래스
 */
class Logger {
  private level: LogLevel = 'info';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.level];
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
}

/**
 * 글로벌 로거 인스턴스
 */
export const logger = new Logger();
