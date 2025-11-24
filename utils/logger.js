/* global chrome */

/**
 * Logging utility with levels for Memento Mori extension
 * Supports: debug, info, warn, error
 * In production, debug logs are disabled
 */

class Logger {
    constructor(context = 'MementoMori') {
        this.context = context;
        this.isProduction = this.detectProduction();
        this.logLevel = this.isProduction ? 'info' : 'debug';
    }

    detectProduction() {
        // Check if we're in production mode
        // You can set this via chrome.storage or manifest
        try {
            // In production, we typically don't have verbose logging
            return !chrome.runtime.getManifest().version.includes('dev');
        } catch (e) {
            return true; // Default to production
        }
    }

    setLevel(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        if (levels.includes(level)) {
            this.logLevel = level;
        }
    }

    shouldLog(level) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        return levels[level] >= levels[this.logLevel];
    }

    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.context}] [${level.toUpperCase()}]`;
        return [prefix, message, ...args];
    }

    debug(message, ...args) {
        if (this.shouldLog('debug')) {
            console.log(...this.formatMessage('debug', message, ...args));
        }
    }

    info(message, ...args) {
        if (this.shouldLog('info')) {
            console.log(...this.formatMessage('info', message, ...args));
        }
    }

    warn(message, ...args) {
        if (this.shouldLog('warn')) {
            console.warn(...this.formatMessage('warn', message, ...args));
        }
    }

    error(message, ...args) {
        if (this.shouldLog('error')) {
            console.error(...this.formatMessage('error', message, ...args));
        }
    }
}

// Export singleton instance
const logger = new Logger();

// Also export class for creating context-specific loggers
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Logger, logger };
}

