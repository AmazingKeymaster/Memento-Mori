/**
 * Unit tests for utility functions
 * Run with: node tests/utils.test.js (if using Node.js test runner)
 * Or integrate with Jest/Mocha
 */

// Mock the Helpers class (in real implementation, import from utils/helpers.js)
class Helpers {
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
        if (age >= expectedLifespan) return -1;
        const yearsLeft = Math.max(0, expectedLifespan - age);
        return Math.floor(yearsLeft * 365.25);
    }

    static parseTime(timeString) {
        if (!timeString) return 0;
        const [hours, minutes] = timeString.split(':').map(Number);
        return (hours || 0) * 60 + (minutes || 0);
    }

    static formatTime(minutes) {
        if (minutes < 60) return `${minutes}m`;
        else if (minutes < 1440) {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        } else {
            const days = Math.floor(minutes / 1440);
            const hours = Math.floor((minutes % 1440) / 60);
            return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
        }
    }

    static cleanHostname(hostname) {
        if (!hostname) return '';
        return hostname.toLowerCase().replace(/^www\./, '');
    }

    static isValidPIN(pin) {
        return /^\d{4}$/.test(pin);
    }

    static daysUntilDeadline(deadline) {
        if (!deadline) return null;
        const deadlineDate = new Date(deadline);
        const now = new Date();
        return Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
    }
}

// Test suite
function runTests() {
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            passed++;
            console.log(`✅ ${name}`);
        } catch (error) {
            failed++;
            console.error(`❌ ${name}: ${error.message}`);
        }
    }

    function assert(condition, message) {
        if (!condition) {
            throw new Error(message || 'Assertion failed');
        }
    }

    // Test calculateAge
    test('calculateAge - valid birthdate', () => {
        const today = new Date();
        const birthYear = today.getFullYear() - 25;
        const birthdate = `${birthYear}-01-01`;
        const age = Helpers.calculateAge(birthdate);
        assert(age === 25 || age === 24, `Expected age around 25, got ${age}`);
    });

    test('calculateAge - empty birthdate', () => {
        assert(Helpers.calculateAge('') === 0, 'Empty birthdate should return 0');
        assert(Helpers.calculateAge(null) === 0, 'Null birthdate should return 0');
    });

    // Test calculateDaysLeft
    test('calculateDaysLeft - normal case', () => {
        const days = Helpers.calculateDaysLeft(25, 'North America');
        assert(days > 0, `Expected positive days, got ${days}`);
        assert(days < 20000, `Expected reasonable days, got ${days}`);
    });

    test('calculateDaysLeft - borrowed time', () => {
        const days = Helpers.calculateDaysLeft(85, 'North America');
        assert(days === -1, `Expected -1 for borrowed time, got ${days}`);
    });

    // Test parseTime
    test('parseTime - valid time', () => {
        assert(Helpers.parseTime('09:00') === 540, '09:00 should be 540 minutes');
        assert(Helpers.parseTime('23:59') === 1439, '23:59 should be 1439 minutes');
        assert(Helpers.parseTime('00:00') === 0, '00:00 should be 0 minutes');
    });

    test('parseTime - invalid time', () => {
        assert(Helpers.parseTime('') === 0, 'Empty time should return 0');
        assert(Helpers.parseTime(null) === 0, 'Null time should return 0');
    });

    // Test formatTime
    test('formatTime - minutes only', () => {
        assert(Helpers.formatTime(30) === '30m', '30 minutes should format to "30m"');
    });

    test('formatTime - hours and minutes', () => {
        assert(Helpers.formatTime(90) === '1h 30m', '90 minutes should format to "1h 30m"');
        assert(Helpers.formatTime(120) === '2h', '120 minutes should format to "2h"');
    });

    test('formatTime - days', () => {
        assert(Helpers.formatTime(1440) === '1d', '1440 minutes should format to "1d"');
        assert(Helpers.formatTime(1500) === '1d 1h', '1500 minutes should format to "1d 1h"');
    });

    // Test cleanHostname
    test('cleanHostname - with www', () => {
        assert(Helpers.cleanHostname('www.facebook.com') === 'facebook.com', 'Should remove www');
    });

    test('cleanHostname - without www', () => {
        assert(Helpers.cleanHostname('reddit.com') === 'reddit.com', 'Should keep hostname as is');
    });

    test('cleanHostname - case insensitive', () => {
        assert(Helpers.cleanHostname('FACEBOOK.COM') === 'facebook.com', 'Should lowercase');
    });

    // Test isValidPIN
    test('isValidPIN - valid PINs', () => {
        assert(Helpers.isValidPIN('1234') === true, '1234 should be valid');
        assert(Helpers.isValidPIN('0000') === true, '0000 should be valid');
        assert(Helpers.isValidPIN('9999') === true, '9999 should be valid');
    });

    test('isValidPIN - invalid PINs', () => {
        assert(Helpers.isValidPIN('123') === false, '3 digits should be invalid');
        assert(Helpers.isValidPIN('12345') === false, '5 digits should be invalid');
        assert(Helpers.isValidPIN('abcd') === false, 'Letters should be invalid');
        assert(Helpers.isValidPIN('') === false, 'Empty should be invalid');
    });

    // Test daysUntilDeadline
    test('daysUntilDeadline - future deadline', () => {
        const future = new Date();
        future.setDate(future.getDate() + 7);
        const days = Helpers.daysUntilDeadline(future.toISOString().split('T')[0]);
        assert(days >= 6 && days <= 7, `Expected around 7 days, got ${days}`);
    });

    test('daysUntilDeadline - past deadline', () => {
        const past = new Date();
        past.setDate(past.getDate() - 7);
        const days = Helpers.daysUntilDeadline(past.toISOString().split('T')[0]);
        assert(days < 0, `Expected negative days, got ${days}`);
    });

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
    console.log('='.repeat(50));

    return { passed, failed, total: passed + failed };
}

// Run tests if executed directly
if (typeof window === 'undefined' && typeof require !== 'undefined') {
    runTests();
}

