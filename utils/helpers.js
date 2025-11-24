/* global chrome */

/**
 * Shared utility functions for Memento Mori extension
 * Contains common logic used across multiple files
 */

class Helpers {
    /**
     * Calculate age from birthdate
     * @param {string} birthdate - Date string in YYYY-MM-DD format
     * @returns {number} Age in years
     */
    static calculateAge(birthdate) {
        if (!birthdate) return 0;
        const today = new Date();
        const birth = new Date(birthdate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    }

    /**
     * Calculate days left based on age and continent
     * @param {number} age - Current age
     * @param {string} continent - User's continent
     * @returns {number} Days remaining (or -1 for borrowed time)
     */
    static calculateDaysLeft(age, continent) {
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
    }

    /**
     * Parse time string (HH:MM) to minutes
     * @param {string} timeString - Time in HH:MM format
     * @returns {number} Minutes since midnight
     */
    static parseTime(timeString) {
        if (!timeString) return 0;
        const [hours, minutes] = timeString.split(':').map(Number);
        return (hours || 0) * 60 + (minutes || 0);
    }

    /**
     * Format minutes to human-readable time string
     * @param {number} minutes - Total minutes
     * @returns {string} Formatted time (e.g., "2h 30m" or "45m")
     */
    static formatTime(minutes) {
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
    }

    /**
     * Clean hostname for matching (remove www, lowercase)
     * @param {string} hostname - Original hostname
     * @returns {string} Cleaned hostname
     */
    static cleanHostname(hostname) {
        if (!hostname) return '';
        return hostname.toLowerCase().replace(/^www\./, '');
    }

    /**
     * Validate date string
     * @param {string} dateString - Date string to validate
     * @returns {boolean} True if valid date
     */
    static isValidDate(dateString) {
        if (!dateString) return false;
        const date = new Date(dateString);
        return !isNaN(date.getTime());
    }

    /**
     * Validate PIN format (4 digits)
     * @param {string} pin - PIN to validate
     * @returns {boolean} True if valid PIN
     */
    static isValidPIN(pin) {
        return /^\d{4}$/.test(pin);
    }

    /**
     * Sanitize user input to prevent XSS
     * @param {string} input - User input string
     * @returns {string} Sanitized string
     */
    static sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    /**
     * Calculate days until deadline
     * @param {string} deadline - Deadline date string
     * @returns {number} Days until deadline (negative if overdue)
     */
    static daysUntilDeadline(deadline) {
        if (!deadline) return null;
        const deadlineDate = new Date(deadline);
        const now = new Date();
        return Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Helpers;
}

