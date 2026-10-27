export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

function parseLogLevel(env?: string): LogLevel {
  const map: Record<string, LogLevel> = {
    DEBUG: LogLevel.DEBUG,
    INFO: LogLevel.INFO,
    WARN: LogLevel.WARN,
    ERROR: LogLevel.ERROR,
  };
  return env && map[env.toUpperCase()] ? map[env.toUpperCase()] : LogLevel.INFO;
}

/**
 * Serialize data for logging, handling Error objects properly.
 * JSON.stringify converts Error to {} because message/stack are non-enumerable.
 */
function safeStringify(data: unknown): string {
  if (data === undefined) return '';
  if (data === null) return 'null';
  if (typeof data === 'string') return data;

  if (data instanceof Error) {
    const info: Record<string, unknown> = {
      name: data.name,
      message: data.message,
    };
    if (data.stack) info.stack = data.stack;
    return JSON.stringify(info, null, 2);
  }

  return JSON.stringify(data, null, 2);
}

class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(prefix: string = 'SlideHarness', level?: LogLevel) {
    this.prefix = prefix;
    this.level = level ?? parseLogLevel(process.env.LOG_LEVEL);
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const base = `[${timestamp}] [${level}] [${this.prefix}] ${message}`;
    if (data !== undefined) {
      return `${base} ${safeStringify(data)}`;
    }
    return base;
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, data));
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage(LogLevel.INFO, message, data));
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, data));
    }
  }

  error(message: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(LogLevel.ERROR, message, data));
    }
  }

  child(prefix: string): Logger {
    return new Logger(`${this.prefix}:${prefix}`, this.level);
  }
}

export const logger = new Logger();
export { Logger };
