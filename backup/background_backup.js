class BackgroundService {
    constructor() {
        this.activeTabId = null;
        this.tabStartTimes = new Map();
        this.sessionStartTime = Date.now();
        this.keepAlivePort = null;
        this.init();
    }

    init() {
        console.log('🚀 Memento Mori Background Service Starting...');
        
        // Keep service worker alive
        this.setupKeepAlive();
        
        // Initialize extension
        chrome.runtime.onInstalled.addListener(() => {
            console.log('📦 Extension installed/updated');
            this.setupInitialData();
            this.setupAlarms();
        });

        // CRITICAL: Handle tab updates for blocking - MUST BE ACTIVE
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                console.log('🔄 Tab updated:', tab.url);
                this.checkAndBlockSite(tab.url, tabId);
            }
        });

        // Track active tab changes for REAL screen time
        chrome.tabs.onActivated.addListener(async (activeInfo) => {
            try {
                console.log('📱 Tab activated:', activeInfo.tabId);
                
                // Stop tracking previous tab
                if (this.activeTabId && this.tabStartTimes.has(this.activeTabId)) {
                    await this.recordTabTime(this.activeTabId);
                }

                // Start tracking new tab
                this.activeTabId = activeInfo.tabId;
                this.tabStartTimes.set(activeInfo.tabId, Date.now());

                const tab = await chrome.tabs.get(activeInfo.tabId);
                if (tab.url) {
                    this.checkAndBlockSite(tab.url, activeInfo.tabId);
                }
            } catch (error) {
                console.log('Error checking active tab:', error);
            }
        });

        // Track when tabs are closed
        chrome.tabs.onRemoved.addListener(async (tabId) => {
            console.log('❌ Tab closed:', tabId);
            if (this.tabStartTimes.has(tabId)) {
                await this.recordTabTime(tabId);
                this.tabStartTimes.delete(tabId);
            }
        });

        // Track window focus changes
        chrome.windows.onFocusChanged.addListener(async (windowId) => {
            if (windowId === chrome.windows.WINDOW_ID_NONE) {
                console.log('🚪 Browser lost focus');
                // Browser lost focus
                if (this.activeTabId && this.tabStartTimes.has(this.activeTabId)) {
                    await this.recordTabTime(this.activeTabId);
                }
            } else {
                console.log('👁️ Browser gained focus');
                // Browser gained focus
                try {
                    const tabs = await chrome.tabs.query({ active: true, windowId: windowId });
                    if (tabs[0]) {
                        this.activeTabId = tabs[0].id;
                        this.tabStartTimes.set(tabs[0].id, Date.now());
                    }
                } catch (error) {
                    console.log('Error handling window focus:', error);
                }
            }
        });

        // Handle alarm events for daily notifications and cleanup
        chrome.alarms.onAlarm.addListener((alarm) => {
            console.log('⏰ Alarm triggered:', alarm.name);
            if (alarm.name === 'dailyReminder') {
                this.sendDailyNotification();
            } else if (alarm.name.startsWith('deadlineReminder_')) {
                this.sendDeadlineNotification(alarm.name.replace('deadlineReminder_', ''));
            } else if (alarm.name === 'dailyAgeUpdate') {
                this.updateAge();
            } else if (alarm.name === 'goalCleanup') {
                this.cleanupCompletedGoals();
            } else if (alarm.name === 'screenTimeSync') {
                this.syncScreenTime();
            } else if (alarm.name === 'keepAlive') {
                this.keepAlive();
            }
        });

        // Sync screen time every 30 seconds for better accuracy
        chrome.alarms.create('screenTimeSync', {
            periodInMinutes: 0.5 // 30 seconds
        });

        // Keep alive alarm every 20 seconds
        chrome.alarms.create('keepAlive', {
            periodInMinutes: 0.33 // 20 seconds
        });

        // Handle messages from content scripts and popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep channel open for async response
        });

        // Update age daily and cleanup goals
        chrome.alarms.create('dailyAgeUpdate', {
            when: this.getNextMidnight(),
            periodInMinutes: 1440 // 24 hours
        });

        chrome.alarms.create('goalCleanup', {
            when: this.getNextMidnight(),
            periodInMinutes: 1440 // 24 hours
        });

        // Enhanced PIN protection for extension management
        if (chrome.management && chrome.management.onUninstalled && chrome.management.onDisabled) {
            try {
                // Check for extension deletion attempts
                chrome.management.onUninstalled.addListener((info) => {
                    if (info.id === chrome.runtime.id) {
                        this.checkStrictModeForDeletion();
                    }
                });

                // Monitor extension disable attempts
                chrome.management.onDisabled.addListener((info) => {
                    if (info.id === chrome.runtime.id) {
                        this.checkStrictModeForDisabling();
                    }
                });
            } catch (error) {
                console.log('Management API not available or restricted:', error);
            }
        } else {
            console.log('Chrome management API not available - strict mode protection limited');
        }

        console.log('✅ Memento Mori Background Service Ready!');
    }

    setupKeepAlive() {
        // Keep service worker alive using a persistent connection
        try {
            this.keepAlivePort = chrome.runtime.connect({ name: 'keepAlive' });
            this.keepAlivePort.onDisconnect.addListener(() => {
                console.log('🔌 Keep alive port disconnected, reconnecting...');
                setTimeout(() => this.setupKeepAlive(), 1000);
            });
        } catch (error) {
            console.log('Keep alive setup error:', error);
        }
    }

    keepAlive() {
        // Periodic keep alive function
        console.log('💓 Service worker keep alive ping');
        try {
            // Perform a simple storage operation to keep the service worker active
            chrome.storage.local.get(['keepAlive'], (result) => {
                chrome.storage.local.set({ keepAlive: Date.now() });
            });
        } catch (error) {
            console.log('Keep alive error:', error);
        }
    }

    async syncScreenTime() {
        // PROPER CONTINUOUS TRACKING - Record time for currently active tab
        if (this.activeTabId && this.tabStartTimes.has(this.activeTabId)) {
            try {
                const tab = await chrome.tabs.get(this.activeTabId);
                if (tab.url && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith('chrome://')) {
                    const startTime = this.tabStartTimes.get(this.activeTabId);
                    const currentTime = Date.now();
                    const timeSpentSeconds = Math.floor((currentTime - startTime) / 1000);
                    
                    // Record time and reset counter every sync (30 seconds)
                    if (timeSpentSeconds >= 30) {
                        const hostname = new URL(tab.url).hostname.toLowerCase();
                        await this.updateScreenTimeStats(hostname, timeSpentSeconds);
                        
                        // Reset start time for next interval
                        this.tabStartTimes.set(this.activeTabId, Date.now());
                        console.log(`⏱️ CONTINUOUS TRACKING: ${hostname} +${timeSpentSeconds}s`);
                    }
                }
            } catch (error) {
                console.log('Error in continuous screen time tracking:', error);
            }
        }
    }

    async recordTabTime(tabId, stopTracking = true) {
        try {
            const startTime = this.tabStartTimes.get(tabId);
            if (!startTime) return;

            const endTime = Date.now();
            const timeSpentSeconds = Math.floor((endTime - startTime) / 1000); // Convert to seconds for accuracy
            
            if (timeSpentSeconds >= 10) { // Only track if spent at least 10 seconds
                const tab = await chrome.tabs.get(tabId);
                if (tab.url) {
                    const hostname = new URL(tab.url).hostname.toLowerCase();
                    await this.updateScreenTimeStats(hostname, timeSpentSeconds);
                }
            }

            if (stopTracking) {
                this.tabStartTimes.delete(tabId);
            } else {
                // Reset start time for continuous tracking
                this.tabStartTimes.set(tabId, Date.now());
            }
        } catch (error) {
            console.log('Error recording tab time:', error);
        }
    }

    async updateScreenTimeStats(hostname, seconds) {
        const today = new Date().toDateString();
        const result = await chrome.storage.local.get(['dailyTimeSpent', 'dailyStats']);
        
        // Update daily time spent (store in seconds for precision)
        const dailyTimeSpent = result.dailyTimeSpent || {};
        if (!dailyTimeSpent[today]) {
            dailyTimeSpent[today] = {};
        }
        if (!dailyTimeSpent[today][hostname]) {
            dailyTimeSpent[today][hostname] = 0;
        }
        dailyTimeSpent[today][hostname] += seconds;

        // Update daily stats (store in seconds)
        const dailyStats = result.dailyStats || {};
        if (!dailyStats[today]) {
            dailyStats[today] = { totalTime: 0, sites: {} };
        }
        if (!dailyStats[today].sites[hostname]) {
            dailyStats[today].sites[hostname] = 0;
        }
        dailyStats[today].sites[hostname] += seconds;
        dailyStats[today].totalTime += seconds;

        await chrome.storage.local.set({ 
            dailyTimeSpent: dailyTimeSpent,
            dailyStats: dailyStats
        });

        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        console.log(`📊 Screen time updated: ${hostname} +${minutes}m ${remainingSeconds}s (Total today: ${Math.floor(dailyStats[today].totalTime / 60)}m)`);
    }

    async checkStrictModeForDeletion() {
        const result = await chrome.storage.local.get(['strictMode', 'strictModePin']);
        if (result.strictMode && result.strictModePin) {
            const enteredPin = prompt('🔒 Extension is in Strict Mode.\nEnter your 4-digit PIN to delete:');
            if (enteredPin !== result.strictModePin) {
                alert('❌ Incorrect PIN! Extension deletion cancelled.\n\nStrict Mode protects against accidental removal.');
                return false;
            }
            alert('✅ PIN verified. Extension deletion authorized.');
        }
        return true;
    }

    async checkStrictModeForDisabling() {
        const result = await chrome.storage.local.get(['strictMode', 'strictModePin']);
        if (result.strictMode && result.strictModePin) {
            const enteredPin = prompt('🔒 Extension is in Strict Mode.\nEnter your 4-digit PIN to disable:');
            if (enteredPin !== result.strictModePin) {
                alert('❌ Incorrect PIN! Extension cannot be disabled in Strict Mode.\n\nThis prevents accidentally disabling your productivity tools.');
                // Attempt to re-enable the extension if possible
                try {
                    chrome.management.setEnabled(chrome.runtime.id, true);
                } catch (error) {
                    console.log('Could not re-enable extension:', error);
                }
                return false;
            }
            alert('✅ PIN verified. Extension disable authorized.');
        }
        return true;
    }

    async cleanupCompletedGoals() {
        const result = await chrome.storage.local.get(['goals']);
        const goals = result.goals || [];
        const today = new Date().toDateString();
        
        // Remove ALL goals from previous days (both completed and incomplete)
        const filteredGoals = goals.filter(goal => {
            if (goal.createdAt) {
                const goalDate = new Date(goal.createdAt).toDateString();
                return goalDate === today; // Keep only today's goals
            }
            return false; // Remove goals without creation date
        });

        if (filteredGoals.length !== goals.length) {
            await chrome.storage.local.set({ goals: filteredGoals });
            console.log(`🧹 Cleaned up ${goals.length - filteredGoals.length} old goals`);
        }
    }

    async setupInitialData() {
        const result = await chrome.storage.local.get(['initialized']);
        if (!result.initialized) {
            // Set default values
            await chrome.storage.local.set({
                initialized: true,
                birthdate: '',
                userAge: 0,
                userContinent: 'North America',
                dailyNotifications: true,
                notificationTime: '09:00', // Default 9 AM
                blockingSchedules: [],
                blockedSites: [],
                allowedSites: [],
                strictMode: false,
                strictModePin: '',
                wastedTime: 0,
                goals: [],
                dailyStats: {},
                weeklyStats: {},
                dailyTimeSpent: {},
                youtubeSettings: {
                    hideHome: false,
                    hideShorts: false,
                    hideComments: false,
                    hideRecommended: false,
                    hideSubscriptions: false,
                    hideExplore: false,
                    hideTrends: false,
                    hideTopBar: false,
                    disableEndCards: false,
                    blackAndWhite: false,
                    disableAutoplay: false
                }
            });
        }
    }

    async setupAlarms() {
        const result = await chrome.storage.local.get(['dailyNotifications', 'notificationTime', 'goals']);
        
        // Clear existing alarms
        chrome.alarms.clear('dailyReminder');
        
        if (result.dailyNotifications) {
            // Set daily reminder alarm with custom time
            const notificationTime = result.notificationTime || '09:00';
            chrome.alarms.create('dailyReminder', {
                when: this.getNextReminderTime(notificationTime),
                periodInMinutes: 1440 // 24 hours
            });
            console.log(`⏰ Daily reminder set for ${notificationTime}`);
        }

        // Setup deadline reminders for goals with deadlines
        if (result.goals) {
            this.setupDeadlineReminders(result.goals);
        }
    }

    async setupDeadlineReminders(goals) {
        // Clear existing deadline alarms
        const alarms = await chrome.alarms.getAll();
        alarms.forEach(alarm => {
            if (alarm.name.startsWith('deadlineReminder_')) {
                chrome.alarms.clear(alarm.name);
            }
        });

        // Set new deadline reminders
        goals.forEach((goal, index) => {
            if (goal.deadline && !goal.completed) {
                const deadlineDate = new Date(goal.deadline);
                const now = new Date();
                
                if (deadlineDate > now) {
                    // Set reminder for 9 AM on deadline day
                    const reminderTime = new Date(deadlineDate);
                    reminderTime.setHours(9, 0, 0, 0);
                    
                    if (reminderTime > now) {
                        chrome.alarms.create(`deadlineReminder_${index}`, {
                            when: reminderTime.getTime()
                        });
                        console.log(`📅 Deadline reminder set for goal "${goal.text}" at ${reminderTime}`);
                    }
                }
            }
        });
    }

    getNextReminderTime(timeString = '09:00') {
        const [hours, minutes] = timeString.split(':').map(Number);
        const now = new Date();
        const tomorrow = new Date(now);
        
        // Set for today first
        const today = new Date(now);
        today.setHours(hours, minutes, 0, 0);
        
        // If time has passed for today, set for tomorrow
        if (today <= now) {
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(hours, minutes, 0, 0);
            return tomorrow.getTime();
        }
        
        return today.getTime();
    }

    getNextMidnight() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.getTime();
    }

    async updateAge() {
        const result = await chrome.storage.local.get(['birthdate']);
        if (result.birthdate) {
            const age = this.calculateAge(result.birthdate);
            await chrome.storage.local.set({ userAge: age });
        }
    }

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
    }

    async sendDailyNotification() {
        const result = await chrome.storage.local.get(['dailyNotifications', 'userAge', 'userContinent', 'birthdate', 'goals']);
        
        if (!result.dailyNotifications) return;

        // Calculate age and days left for mortality reminder
        let age = result.userAge || 0;
        if (result.birthdate) {
            age = this.calculateAge(result.birthdate);
        }

        const daysLeft = this.calculateDaysLeft(age, result.userContinent);
        
        let baseMessage;
        if (daysLeft < 0) {
            baseMessage = "You're living on borrowed time 🕰️... Every second is a gift!";
        } else {
            baseMessage = `You have ${daysLeft.toLocaleString()} days left. Better use them wisely.`;
        }

        // Check for upcoming deadlines
        const goals = result.goals || [];
        const urgentDeadlines = goals.filter(goal => {
            if (!goal.deadline || goal.completed) return false;
            
            const deadlineDate = new Date(goal.deadline);
            const now = new Date();
            const daysUntilDeadline = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
            
            return daysUntilDeadline <= 7 && daysUntilDeadline >= 0; // Show if within 7 days
        });

        let message = baseMessage;
        
        // Add deadline info if exists
        if (urgentDeadlines.length > 0) {
            const deadline = urgentDeadlines[0]; // Get most urgent
            const deadlineDate = new Date(deadline.deadline);
            const now = new Date();
            const daysUntilDeadline = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
            
            if (daysUntilDeadline === 0) {
                message += ` & DEADLINE TODAY: "${deadline.text}"`;
            } else if (daysUntilDeadline === 1) {
                message += ` & DEADLINE TOMORROW: "${deadline.text}"`;
            } else {
                message += ` & you have ${daysUntilDeadline} days left till "${deadline.text}"`;
            }
        }

        // FORCE NOTIFICATION - Remove permission check that might be blocking
        try {
            const notificationId = await chrome.notifications.create('dailyReminder', {
                type: 'basic',
                iconUrl: 'assets/icon-48.png',
                title: 'Memento Mori',
                message: message
            });
            console.log('✅ Daily notification sent with ID:', notificationId, 'Message:', message);
            
            // FORCE SHOW notification immediately for testing
            chrome.notifications.create(`test_${Date.now()}`, {
                type: 'basic',
                iconUrl: 'assets/icon-48.png',
                title: 'NOTIFICATION TEST',
                message: 'If you see this, notifications are working!'
            });
            
        } catch (error) {
            console.error('❌ Failed to create notification:', error);
        }
    }

    async sendDeadlineNotification(goalIndex) {
        const result = await chrome.storage.local.get(['goals']);
        const goals = result.goals || [];
        const goal = goals[parseInt(goalIndex)];
        
        if (goal && goal.deadline && !goal.completed) {
            const deadlineDate = new Date(goal.deadline);
            const now = new Date();
            const daysLeft = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
            
            let message;
            if (daysLeft === 0) {
                message = `⚠️ DEADLINE TODAY: "${goal.text}"`;
            } else if (daysLeft === 1) {
                message = `⚠️ DEADLINE TOMORROW: "${goal.text}"`;
            } else {
                message = `⚠️ You have ${daysLeft} days left till your deadline: "${goal.text}"`;
            }
            
            chrome.notifications.create(`deadlineAlert_${goalIndex}`, {
                type: 'basic',
                iconUrl: 'assets/icon-48.png',
                title: 'Memento Mori - Deadline Alert',
                message: message
            });
        }
    }

    calculateDaysLeft(age, continent) {
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

    async checkAndBlockSite(url, tabId) {
        try {
            // Don't block extension pages
            if (url.startsWith('chrome-extension://') || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('moz-extension://')) {
                return;
            }

            const result = await chrome.storage.local.get(['blockingSchedules']);
            let hostname = '';
            try {
                hostname = new URL(url).hostname.toLowerCase();
            } catch (e) {
                console.log('Invalid URL:', url);
                return;
            }
            
            const currentTime = new Date();
            
            console.log('🔍 CHECKING SITE:', hostname, 'at', currentTime.toLocaleTimeString());
            console.log('📋 Active schedules:', result.blockingSchedules?.length || 0);
            
            // IMPROVED BLOCKING CHECK
            if (this.shouldBlockSite(hostname, currentTime, result.blockingSchedules || [])) {
                console.log('🚫 BLOCKING SITE:', hostname);
                
                // Track wasted time before blocking
                await this.trackWastedTime();
                
                // FORCE REDIRECT to blocked page
                const blockedUrl = chrome.runtime.getURL('blocked.html') + '?site=' + encodeURIComponent(hostname) + '&blocked_at=' + Date.now();
                
                try {
                    await chrome.tabs.update(tabId, { url: blockedUrl });
                    console.log('✅ SUCCESSFULLY BLOCKED and redirected to:', blockedUrl);
                } catch (redirectError) {
                    console.error('❌ REDIRECT FAILED:', redirectError);
                    // Try alternative method
                    try {
                        chrome.tabs.reload(tabId);
                        setTimeout(() => {
                            chrome.tabs.update(tabId, { url: blockedUrl });
                        }, 100);
                    } catch (altError) {
                        console.error('❌ ALTERNATIVE REDIRECT FAILED:', altError);
                    }
                }
            }
        } catch (error) {
            console.error('❌ ERROR in checkAndBlockSite:', error);
        }
    }

    shouldBlockSite(hostname, currentTime, blockingSchedules) {
        if (!blockingSchedules || blockingSchedules.length === 0) {
            console.log('📝 No blocking schedules found');
            return false;
        }
        
        const activeSchedules = blockingSchedules.filter(schedule => schedule.active);
        console.log('⚡ Active schedules:', activeSchedules.length);
        
        for (const schedule of activeSchedules) {
            console.log('🕐 Checking schedule:', schedule.name, 'for time:', currentTime.toLocaleTimeString());
            
            // Check if current time is in schedule
            if (!this.isBlockingTimeActive(currentTime, schedule)) {
                console.log('⏰ Time not in schedule range');
                continue;
            }
            
            // IMPROVED SITE MATCHING LOGIC
            if (schedule.blockedSites && schedule.blockedSites.length > 0) {
                for (const site of schedule.blockedSites) {
                    const siteLower = site.toLowerCase().trim();
                    const hostnameLower = hostname.toLowerCase();
                    
                    // Remove www. prefix for better matching
                    const cleanHostname = hostnameLower.replace(/^www\./, '');
                    const cleanSite = siteLower.replace(/^www\./, '');
                    
                    // Multiple matching strategies for better blocking
                    const isMatch = 
                        cleanHostname === cleanSite ||                    // Exact match
                        cleanHostname.includes(cleanSite) ||             // Hostname contains site
                        cleanSite.includes(cleanHostname) ||             // Site contains hostname
                        cleanHostname.endsWith('.' + cleanSite) ||       // Subdomain match
                        cleanSite.endsWith('.' + cleanHostname) ||       // Parent domain match
                        cleanHostname.split('.').slice(-2).join('.') === cleanSite.split('.').slice(-2).join('.'); // Same domain
                    
                    if (isMatch) {
                        console.log('🎯 BLOCKING MATCH FOUND!');
                        console.log('   Original hostname:', hostname);
                        console.log('   Clean hostname:', cleanHostname);
                        console.log('   Blocked site:', cleanSite);
                        return true;
                    }
                }
            }
        }
        
        console.log('✅ Site not blocked');
        return false;
    }

    isBlockingTimeActive(currentTime, schedule) {
        const currentDay = currentTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const currentHour = currentTime.getHours();
        const currentMinute = currentTime.getMinutes();
        const currentTimeMinutes = currentHour * 60 + currentMinute;

        // Check if current day is in schedule
        if (!schedule.days || !schedule.days.includes(currentDay)) {
            console.log('📅 Current day', currentDay, 'not in schedule days:', schedule.days);
            return false;
        }
        
        // Check if current time is in schedule
        const startTime = this.parseTime(schedule.startTime);
        const endTime = this.parseTime(schedule.endTime);
        
        console.log('🕐 Time check:', currentTimeMinutes, 'vs', startTime, '-', endTime);
        
        let isInTimeRange = false;
        if (startTime <= endTime) {
            isInTimeRange = currentTimeMinutes >= startTime && currentTimeMinutes <= endTime;
        } else {
            // Handle overnight schedules
            isInTimeRange = currentTimeMinutes >= startTime || currentTimeMinutes <= endTime;
        }
        
        console.log('⏰ Is in time range:', isInTimeRange);
        return isInTimeRange;
    }

    parseTime(timeString) {
        if (!timeString) return 0;
        const [hours, minutes] = timeString.split(':').map(Number);
        return (hours || 0) * 60 + (minutes || 0);
    }

    async trackWastedTime() {
        const result = await chrome.storage.local.get(['wastedTime', 'dailyStats']);
        const newWastedTime = (result.wastedTime || 0) + 1;
        
        // Update daily stats
        const today = new Date().toDateString();
        const dailyStats = result.dailyStats || {};
        if (!dailyStats[today]) {
            dailyStats[today] = { blocked: 0, productive: 0, totalTime: 0 };
        }
        dailyStats[today].blocked += 1;
        
        await chrome.storage.local.set({ 
            wastedTime: newWastedTime,
            dailyStats: dailyStats
        });
        
        // Notify popup to update display with proper error handling
        try {
            chrome.runtime.sendMessage({
                action: 'updateWastedTime',
                time: newWastedTime
            }, () => {
                // Handle connection error silently - this prevents runtime.lastError
                if (chrome.runtime.lastError) {
                    // Popup may not be open, this is normal
                }
            });
        } catch (error) {
            // Popup may not be open, ignore
        }
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'activateServiceWorker':
                    console.log('🔥 SERVICE WORKER ACTIVATION REQUEST RECEIVED!');
                    // Force activation by performing storage operations
                    await chrome.storage.local.get(['blockingSchedules']);
                    sendResponse({ success: true, message: 'Service worker activated' });
                    break;
                    
                case 'setupDailyReminder':
                    await this.setupAlarms();
                    sendResponse({ success: true });
                    break;
                    
                case 'updateBlockingRules':
                    console.log('🔄 FORCE UPDATING BLOCKING RULES...');
                    await this.updateBlockingRules();
                    sendResponse({ success: true, message: 'Blocking rules updated' });
                    break;
                    
                case 'resetWastedTime':
                    await chrome.storage.local.set({ wastedTime: 0 });
                    sendResponse({ success: true });
                    break;
                    
                case 'updateNotificationTime':
                    await this.setupAlarms(); // Refresh alarms with new time
                    sendResponse({ success: true });
                    break;
                    
                case 'updateGoalDeadlines':
                    const result = await chrome.storage.local.get(['goals']);
                    if (result.goals) {
                        await this.setupDeadlineReminders(result.goals);
                    }
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            console.error('❌ Message handler error:', error);
            sendResponse({ error: error.message });
        }
    }

    async updateBlockingRules() {
        // Force check all open tabs
        try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
                    this.checkAndBlockSite(tab.url, tab.id);
                }
            }
        } catch (error) {
            console.log('Error updating blocking rules:', error);
        }
        return true;
    }
}

// Initialize background service IMMEDIATELY
console.log('🚀 MEMENTO MORI: Starting background service...');
const backgroundService = new BackgroundService();

// Force immediate activation
chrome.runtime.onStartup.addListener(() => {
    console.log('🔄 Chrome startup - reactivating Memento Mori');
    backgroundService.updateBlockingRules();
});

// Keep the service worker alive
setInterval(() => {
    console.log('💓 Memento Mori heartbeat');
    chrome.storage.local.get(['heartbeat'], () => {
        chrome.storage.local.set({ heartbeat: Date.now() });
    });
}, 20000); // Every 20 seconds