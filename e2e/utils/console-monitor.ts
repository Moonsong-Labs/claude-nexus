import { Page, ConsoleMessage } from '@playwright/test';

export interface ConsoleError {
  text: string;
  url: string;
  timestamp: Date;
}

export class ConsoleMonitor {
  private errors: ConsoleError[] = [];
  private warnings: ConsoleError[] = [];
  private page: Page;
  
  // Known third-party patterns to ignore
  private readonly ignorePatterns = [
    // Common third-party analytics/tracking
    /google-analytics/i,
    /googletagmanager/i,
    /facebook\.com/i,
    /doubleclick\.net/i,
    // Browser extensions
    /chrome-extension:\/\//,
    /moz-extension:\/\//,
    // Known warnings that are acceptable
    /DevTools failed to load source map/,
    /Third-party cookie will be blocked/,
    // Add more patterns as needed
  ];

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Start monitoring console messages
   */
  async startMonitoring(): Promise<void> {
    // Listen for console messages
    this.page.on('console', (msg: ConsoleMessage) => {
      const type = msg.type();
      const text = msg.text();
      const location = msg.location();
      
      // Skip if matches ignore pattern
      if (this.shouldIgnore(text)) {
        return;
      }

      const error: ConsoleError = {
        text,
        url: location.url,
        timestamp: new Date(),
      };

      if (type === 'error') {
        this.errors.push(error);
      } else if (type === 'warning') {
        this.warnings.push(error);
      }
    });

    // Listen for page errors (uncaught exceptions)
    this.page.on('pageerror', (error: Error) => {
      // Skip if matches ignore pattern
      if (this.shouldIgnore(error.message)) {
        return;
      }

      this.errors.push({
        text: error.message,
        url: this.page.url(),
        timestamp: new Date(),
      });
    });
  }

  /**
   * Check if a message should be ignored based on patterns
   */
  private shouldIgnore(text: string): boolean {
    return this.ignorePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Get all console errors
   */
  getErrors(): ConsoleError[] {
    return [...this.errors];
  }

  /**
   * Get all console warnings
   */
  getWarnings(): ConsoleError[] {
    return [...this.warnings];
  }

  /**
   * Check if there are any errors
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Clear all recorded messages
   */
  clear(): void {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Get a formatted error report
   */
  getErrorReport(): string {
    if (this.errors.length === 0) {
      return 'No console errors detected';
    }

    return `Console Errors (${this.errors.length}):\n` +
      this.errors.map((err, i) => 
        `  ${i + 1}. ${err.text}\n     URL: ${err.url}\n     Time: ${err.timestamp.toISOString()}`
      ).join('\n');
  }

  /**
   * Assert no console errors (for use in tests)
   */
  assertNoErrors(): void {
    if (this.hasErrors()) {
      throw new Error(this.getErrorReport());
    }
  }
}