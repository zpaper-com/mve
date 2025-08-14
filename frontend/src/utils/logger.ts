import { config } from '../config';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface Logger {
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
}

class ConsoleLogger implements Logger {
  private shouldLog(level: LogLevel): boolean {
    if (!config.logging.enableConsole) return false;

    const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
    const configLevel = config.logging.level;
    
    return levels.indexOf(level) <= levels.indexOf(configLevel);
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(`[MVE] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[MVE] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(`[MVE] ${message}`, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`[MVE] ${message}`, ...args);
    }
  }
}

export const logger: Logger = new ConsoleLogger();