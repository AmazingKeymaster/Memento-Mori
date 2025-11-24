/* global chrome */

/**
 * Shared utilities for Memento Mori extension
 * Load this file before other scripts that need these utilities
 */

// Simple logger with levels
const Logger = {
    level: 'info', // 'debug', 'info', 'warn', 'error'
    isProduction: true,
    
    setLevel(level) {
        this.level = level;
    },
    
    shouldLog(level) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        return levels[level] >= levels[this.level];
    },
    
    debug(message, ...args) {
        if (this.shouldLog('debug')) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    },
    
    info(message, ...args) {
        if (this.shouldLog('info')) {
            console.log(`[INFO] ${message}`, ...args);
        }
    },
    
    warn(message, ...args) {
        if (this.shouldLog('warn')) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    },
    
    error(message, ...args) {
        if (this.shouldLog('error')) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    }
};

// Helper functions
const Helpers = {
    calculateAge(birthdate) {
        if (!birthdate) return 0;
        const today = new Date();
        const birth = new Date(birthdate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    },

    calculateDaysLeft(age, continent) {
        if (age === 0) return 0;
        
        const lifeExpectancy = {
            'North America': 79,
            'Europe': 78,
            'Asia': 73,
            'South America': 76,
            'Africa': 64,
            'Oceania': 81,
            'Antarctica': 79
        };
        
        const expectedLifespan = lifeExpectancy[continent] || 79;
        
        if (age >= expectedLifespan) {
            return -1; // Borrowed time
        }
        
        const yearsLeft = Math.max(0, expectedLifespan - age);
        return Math.floor(yearsLeft * 365.25);
    },

    parseTime(timeString) {
        if (!timeString) return 0;
        const [hours, minutes] = timeString.split(':').map(Number);
        return (hours || 0) * 60 + (minutes || 0);
    },

    formatTime(minutes) {
        if (minutes < 60) {
            return `${minutes}m`;
        } else if (minutes < 1440) {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        } else {
            const days = Math.floor(minutes / 1440);
            const hours = Math.floor((minutes % 1440) / 60);
            return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
        }
    },

    cleanHostname(hostname) {
        if (!hostname) return '';
        return hostname.toLowerCase().replace(/^www\./, '');
    },

    isValidPIN(pin) {
        return /^\d{4}$/.test(pin);
    },

    daysUntilDeadline(deadline) {
        if (!deadline) return null;
        const deadlineDate = new Date(deadline);
        const now = new Date();
        return Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
    }
};

