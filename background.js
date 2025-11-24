// Import shared utilities
importScripts('utils.js');

class BackgroundService {
    constructor() {
        this.activeTabId = null;
        this.tabStartTimes = new Map();
        this.sessionStartTime = Date.now();
        this.keepAlivePort = null;
        
        // REAL TRACKING STATE
        this.isWindowFocused = true;
        this.isUserIdle = false;
        this.isReallyTracking = false;
        
        // SMART IDLE DETECTION STATE
        this.smartIdleState = {
            isIdle: false,
            noMouseMovement: false,
            noKeyPress: false,
            videoIsPlaying: false,
            audioIsPlaying: false,
            scrollingIsDetected: false,
            tabIsInFocus: true,
            timeSinceLastActivity: 0
        };
        
        // SAVED TIME TRACKING
        this.lastSavedTimeUpdate = Date.now();
        this.currentlyActiveSchedules = [];
        
        this.init();
    }

    init() {
        // Import utils if available (for service worker, we'll use inline version)
        // Logger and Helpers are defined in utils.js and loaded via importScripts
        Logger.info('Memento Mori Background Service Starting...');
        
        // Keep service worker alive
        this.setupKeepAlive();
        
        // Initialize extension
        chrome.runtime.onInstalled.addListener(async (details) => {
            Logger.info('Extension installed/updated');
            await this.setupInitialData();
            this.setupAlarms();
            
            // Show onboarding on first install
            if (details.reason === 'install') {
                const result = await chrome.storage.local.get(['onboardingCompleted']);
                if (!result.onboardingCompleted) {
                    const onboardingUrl = chrome.runtime.getURL('onboarding.html');
                    chrome.tabs.create({ url: onboardingUrl });
                }
            }
        });

        // CRITICAL: Handle tab updates for blocking - MUST BE ACTIVE
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                Logger.debug('Tab updated:', tab.url);
                this.checkAndBlockSite(tab.url, tabId);
            }
        });

        // Track active tab changes for REAL screen time
        chrome.tabs.onActivated.addListener(async (activeInfo) => {
            try {
                Logger.debug('Tab activated:', activeInfo.tabId);
                
                // Stop tracking previous tab
                await this.stopRealTracking();

                // Start tracking new tab
                this.activeTabId = activeInfo.tabId;
                await this.startRealTracking();

                const tab = await chrome.tabs.get(activeInfo.tabId);
                if (tab.url) {
                    this.checkAndBlockSite(tab.url, activeInfo.tabId);
                }
            } catch (error) {
                Logger.error('Error checking active tab:', error);
            }
        });

        // Track when tabs are closed
        chrome.tabs.onRemoved.addListener(async (tabId) => {
            Logger.debug('Tab closed:', tabId);
            if (tabId === this.activeTabId) {
                await this.stopRealTracking();
                this.activeTabId = null;
            }
        });

        // Track window focus changes - CRITICAL FOR REAL TRACKING
        chrome.windows.onFocusChanged.addListener(async (windowId) => {
            if (windowId === chrome.windows.WINDOW_ID_NONE) {
                Logger.debug('Browser lost focus - STOP TRACKING');
                this.isWindowFocused = false;
                await this.stopRealTracking();
            } else {
                Logger.debug('Browser gained focus - START TRACKING');
                this.isWindowFocused = true;
                await this.startRealTracking();
            }
        });

        // Track user idle state - CRITICAL FOR REAL TRACKING
        chrome.idle.onStateChanged.addListener(async (state) => {
            Logger.debug('Idle state changed:', state);
            this.isUserIdle = (state !== 'active');
            
            if (this.isUserIdle) {
                Logger.info('😴 User idle - STOP TRACKING');
                await this.stopRealTracking();
            } else {
                Logger.info('⚡ User active - START TRACKING');
                await this.startRealTracking();
            }
        });

        // Set idle detection to 30 seconds
        chrome.idle.setDetectionInterval(30);

        // Handle alarm events for daily notifications and cleanup
        chrome.alarms.onAlarm.addListener((alarm) => {
            Logger.debug('⏰ Alarm triggered:', alarm.name);
            if (alarm.name === 'dailyReminder') {
                this.sendDailyNotification();
            } else if (alarm.name.startsWith('deadlineReminder_')) {
                this.sendDeadlineNotification(alarm.name.replace('deadlineReminder_', ''));
            } else if (alarm.name === 'dailyAgeUpdate') {
                this.updateAge();
            } else if (alarm.name === 'goalCleanup') {
                this.cleanupCompletedGoals();
            } else if (alarm.name === 'screenTimeSync') {
                // Maintain real tracking state and update screen time every second
                this.updateScreenTimeEverySecond();
            } else if (alarm.name === 'savedTimeCheck') {
                // Check if schedules are active and update saved time
                this.updateSavedTimeEverySecond();
            } else if (alarm.name === 'scheduleNotificationCheck') {
                // Check for schedule start/end notifications
                this.checkScheduleNotifications();
            } else if (alarm.name === 'keepAlive') {
                this.keepAlive();
            }
        });

        // Sync real tracking every 1 second for precise tracking
        chrome.alarms.create('screenTimeSync', {
            periodInMinutes: 0.017 // 1 second
        });

        // Check schedules and update saved time every second
        chrome.alarms.create('savedTimeCheck', {
            periodInMinutes: 0.017 // 1 second
        });

        // Check for schedule notifications every minute
        chrome.alarms.create('scheduleNotificationCheck', {
            periodInMinutes: 1 // 1 minute
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

        // Initialize with current active tab
        this.initializeActiveTab();

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
                Logger.warn('Management API not available or restricted:', error);
            }
        } else {
            Logger.warn('Chrome management API not available - strict mode protection limited');
        }

        Logger.info('✅ Memento Mori Background Service Ready!');
    }

    setupKeepAlive() {
        // Keep service worker alive using a persistent connection
        try {
            this.keepAlivePort = chrome.runtime.connect({ name: 'keepAlive' });
            this.keepAlivePort.onDisconnect.addListener(() => {
                Logger.warn('🔌 Keep alive port disconnected, reconnecting...');
                setTimeout(() => this.setupKeepAlive(), 1000);
            });
        } catch (error) {
            Logger.error('Keep alive setup error:', error);
        }
    }

    keepAlive() {
        // Periodic keep alive function
        Logger.debug('💓 Service worker keep alive ping');
        try {
            // Perform a simple storage operation to keep the service worker active
            chrome.storage.local.get(['keepAlive'], (result) => {
                chrome.storage.local.set({ keepAlive: Date.now() });
            });
        } catch (error) {
            Logger.error('Keep alive error:', error);
        }
    }

    async startRealTracking() {
        // Only track if: active tab + window focused + user not idle
        const shouldTrack = this.activeTabId && this.isWindowFocused && !this.isUserIdle;
        
        if (shouldTrack && !this.isReallyTracking) {
            try {
                const tab = await chrome.tabs.get(this.activeTabId);
                if (tab.url && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith('chrome://')) {
                    this.tabStartTimes.set(this.activeTabId, Date.now());
                    this.isReallyTracking = true;
                    const hostname = new URL(tab.url).hostname.toLowerCase();
                    Logger.info(`🟢 REAL TRACKING STARTED: ${hostname}`);
                }
            } catch (error) {
                Logger.error('Error starting real tracking:', error);
            }
        }
    }

    async stopRealTracking() {
        if (this.isReallyTracking && this.activeTabId && this.tabStartTimes.has(this.activeTabId)) {
            try {
                const tab = await chrome.tabs.get(this.activeTabId);
                if (tab.url) {
                    const startTime = this.tabStartTimes.get(this.activeTabId);
                    const endTime = Date.now();
                    const timeSpentSeconds = Math.floor((endTime - startTime) / 1000);
                    
                    if (timeSpentSeconds >= 1) {
                        const hostname = new URL(tab.url).hostname.toLowerCase();
                        await this.processRealScreenTime(hostname, timeSpentSeconds);
                        Logger.info(`🔴 REAL TRACKING STOPPED: ${hostname} +${timeSpentSeconds}s`);
                    }
                }
            } catch (error) {
                Logger.error('Error stopping real tracking:', error);
            }
        }
        
        this.isReallyTracking = false;
        this.tabStartTimes.clear();
    }

    async processRealScreenTime(hostname, seconds) {
        const result = await chrome.storage.local.get(['blockingSchedules', 'dailyStats']);
        const today = new Date().toDateString();
        
        // ALWAYS RECORD SCREEN TIME - track ALL sites for total screen time
        await this.recordScreenTime(hostname, seconds);
        Logger.info(`📊 SCREEN TIME: ${hostname} +${seconds}s (ALWAYS TRACKED)`);
        
        // FIXED WASTED TIME LOGIC: If this site is in ANY blocking schedule, it's considered "distracting"
        // Wasted time = time spent on sites you want to avoid (regardless of current blocking status)
        const isDistractingSite = this.isSiteTracked(hostname, result.blockingSchedules || []);
        
        if (isDistractingSite) {
            // This is WASTED TIME - time spent on a site you've marked as distracting
            await this.recordWastedTime(hostname, seconds);
            Logger.info(`💸 WASTED TIME: ${hostname} +${seconds}s (distracting site)`);
        }
    }

    isSiteTracked(hostname, schedules) {
        for (const schedule of schedules) {
            if (schedule.blockedSites && schedule.blockedSites.length > 0) {
                for (const site of schedule.blockedSites) {
                    const siteLower = site.toLowerCase().trim();
                    const hostnameLower = hostname.toLowerCase();
                    const cleanHostname = hostnameLower.replace(/^www\./, '');
                    const cleanSite = siteLower.replace(/^www\./, '');
                    
                    if (cleanHostname === cleanSite || cleanHostname.includes(cleanSite) || cleanSite.includes(cleanHostname)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    async recordScreenTime(hostname, seconds) {
        const today = new Date().toDateString();
        const result = await chrome.storage.local.get(['dailyStats']);
        const dailyStats = result.dailyStats || {};
        
        if (!dailyStats[today]) {
            dailyStats[today] = { totalTime: 0, sites: {}, savedTime: 0, untracked: {} };
        }
        if (!dailyStats[today].sites[hostname]) {
            dailyStats[today].sites[hostname] = 0;
        }
        
        dailyStats[today].sites[hostname] += seconds;
        dailyStats[today].totalTime += seconds;
        
        await chrome.storage.local.set({ dailyStats: dailyStats });
        
        // Only notify popup every 10 seconds to reduce message spam
        const now = Date.now();
        if (!this.lastPopupUpdate || (now - this.lastPopupUpdate) > 10000) {
            this.lastPopupUpdate = now;
            
            // Notify popup of updated screen time
            try {
                chrome.runtime.sendMessage({
                    action: 'updateScreenTime',
                    totalTime: dailyStats[today].totalTime,
                    todaysData: dailyStats[today]
                });
            } catch (error) {
                // Popup may not be open
            }
        }
    }

    async recordWastedTime(hostname, seconds) {
        const today = new Date().toDateString();
        const result = await chrome.storage.local.get(['dailyStats']);
        const dailyStats = result.dailyStats || {};
        
        if (!dailyStats[today]) {
            dailyStats[today] = { totalTime: 0, sites: {}, savedTime: 0, untracked: {} };
        }
        
        dailyStats[today].savedTime = (dailyStats[today].savedTime || 0) + seconds;
        
        await chrome.storage.local.set({ dailyStats: dailyStats });
        
        // Notify popup
        try {
            chrome.runtime.sendMessage({
                action: 'updateWastedTime',
                time: dailyStats[today].wastedTime
            });
        } catch (error) {
            // Popup may not be open
        }
    }

    async recordUntracked(hostname, seconds) {
        const today = new Date().toDateString();
        const result = await chrome.storage.local.get(['dailyStats']);
        const dailyStats = result.dailyStats || {};
        
        if (!dailyStats[today]) {
            dailyStats[today] = { totalTime: 0, sites: {}, wastedTime: 0, untracked: {} };
        }
        if (!dailyStats[today].untracked[hostname]) {
            dailyStats[today].untracked[hostname] = 0;
        }
        
        dailyStats[today].untracked[hostname] += seconds;
        
        // Check if we should recommend tracking this site (3+ hours this week)
        await this.checkRecommendations(hostname, dailyStats);
        
        await chrome.storage.local.set({ dailyStats: dailyStats });
    }

    async checkRecommendations(hostname, dailyStats) {
        let weeklyTotal = 0;
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        // Sum up time on this untracked site over the past week
        for (const [dateStr, stats] of Object.entries(dailyStats)) {
            const date = new Date(dateStr);
            if (date >= oneWeekAgo && stats.untracked && stats.untracked[hostname]) {
                weeklyTotal += stats.untracked[hostname];
            }
        }
        
        // If 3+ hours (10800 seconds) this week, suggest tracking
        if (weeklyTotal >= 10800) {
            const hours = Math.floor(weeklyTotal / 3600);
            Logger.info(`💡 RECOMMENDATION: Add ${hostname} to tracking (${hours}h this week)`);
            
            // Could show notification here
            try {
                const iconUrl = chrome.runtime.getURL('assets/icon-48.png');
                chrome.notifications.create(`recommend_${hostname}`, {
                    type: 'basic',
                    iconUrl: iconUrl,
                    title: 'Memento Mori - Tracking Suggestion',
                    message: `You've spent ${hours}+ hours on ${hostname} this week. Want to add it to your tracked sites?`
                });
            } catch (error) {
                Logger.error('Could not show recommendation notification:', error);
            }
        }
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
                    Logger.error('Could not re-enable extension:', error);
                }
                return false;
            }
            alert('✅ PIN verified. Extension disable authorized.');
        }
        return true;
    }

    async cleanupCompletedGoals() {
        const result = await chrome.storage.local.get(['goals', 'wastedTime']);
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
            Logger.info(`🧹 Cleaned up ${goals.length - filteredGoals.length} old goals`);
        }
        
        // CLEAN UP OLD CUMULATIVE WASTED TIME - Reset to 0 daily
        if (result.wastedTime && result.wastedTime > 0) {
            await chrome.storage.local.set({ wastedTime: 0 });
            Logger.info(`🧹 Reset cumulative wasted time to 0 - now using daily tracking only`);
        }
        
        // CLEAN UP OLD NOTIFICATION TRACKING - Keep only last 2 days
        const notifResult = await chrome.storage.local.get(['sentNotificationsToday']);
        if (notifResult.sentNotificationsToday) {
            const sentNotifications = notifResult.sentNotificationsToday;
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toDateString();
            
            // Keep only today and yesterday
            const cleanedNotifications = {};
            if (sentNotifications[today]) cleanedNotifications[today] = sentNotifications[today];
            if (sentNotifications[yesterdayStr]) cleanedNotifications[yesterdayStr] = sentNotifications[yesterdayStr];
            
            await chrome.storage.local.set({ sentNotificationsToday: cleanedNotifications });
            Logger.info(`🧹 Cleaned up old notification tracking data`);
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
            Logger.info(`⏰ Daily reminder set for ${notificationTime}`);
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
                        Logger.info(`Deadline reminder set for goal "${goal.text}" at ${reminderTime}`);
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
        // Use shared helper function
        return Helpers.calculateAge(birthdate);
    }

    async sendDailyNotification() {
        const result = await chrome.storage.local.get(['dailyNotifications', 'userAge', 'userContinent', 'birthdate', 'goals']);
        
        if (!result.dailyNotifications) return;

        // Calculate age and days left for mortality reminder
        let age = result.userAge || 0;
        if (result.birthdate) {
            age = this.calculateAge(result.birthdate);
        }

        const daysLeft = Helpers.calculateDaysLeft(age, result.userContinent);
        
        let baseMessage;
        if (daysLeft < 0) {
            baseMessage = "You're living on borrowed time 🕰️... Every second is a gift!";
        } else {
            baseMessage = `You have ${daysLeft.toLocaleString()} days left. Better use them wisely.`;
        }

        // Check for upcoming deadlines
        const goals = result.goals || [];
        
        // First, find urgent deadlines within 7 days
        const urgentDeadlines = goals.filter(goal => {
            if (!goal.deadline || goal.completed) return false;
            
            const deadlineDate = new Date(goal.deadline);
            const now = new Date();
            const daysUntilDeadline = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
            
            return daysUntilDeadline <= 7 && daysUntilDeadline >= 0; // Show if within 7 days
        });

        let message = baseMessage;
        
        // Add deadline info if exists - MAKE IT PROMINENT
        let deadlineToShow = null;
        
        if (urgentDeadlines.length > 0) {
            // Show most urgent deadline within 7 days
            deadlineToShow = urgentDeadlines[0];
        } else {
            // If no urgent deadlines, find the next closest deadline within 30 days max
            const upcomingDeadlines = goals
                .filter(goal => {
                    if (!goal.deadline || goal.completed) return false;
                    const deadlineDate = new Date(goal.deadline);
                    const now = new Date();
                    const daysUntilDeadline = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
                    return daysUntilDeadline >= 0 && daysUntilDeadline <= 30; // Within 30 days max
                })
                .sort((a, b) => {
                    const dateA = new Date(a.deadline);
                    const dateB = new Date(b.deadline);
                    return dateA - dateB; // Sort by closest first
                });
            
            if (upcomingDeadlines.length > 0) {
                deadlineToShow = upcomingDeadlines[0]; // Most urgent deadline within 30 days
            }
        }
        
        if (deadlineToShow) {
            const deadlineDate = new Date(deadlineToShow.deadline);
            const now = new Date();
            const daysUntilDeadline = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
            
            if (daysUntilDeadline === 0) {
                message = `🚨 DEADLINE TODAY: "${deadlineToShow.text}" & ` + baseMessage;
            } else if (daysUntilDeadline === 1) {
                message = `⚠️ DEADLINE TOMORROW: "${deadlineToShow.text}" & ` + baseMessage;
            } else {
                message = `📅 ${daysUntilDeadline} DAYS LEFT until "${deadlineToShow.text}" & ` + baseMessage;
            }
        }

        // Create notification with required properties (NO MORE TEST NOTIFICATIONS)
        try {
            Logger.debug('Attempting to create daily notification...');
            
            const iconUrl = chrome.runtime.getURL('assets/icon-48.png');
            const notificationOptions = {
                type: 'basic',
                iconUrl: iconUrl,
                title: 'Memento Mori',
                message: message
            };
            
            Logger.debug('Notification options:', notificationOptions);
            
            chrome.notifications.create('dailyReminder', notificationOptions, (notificationId) => {
                if (chrome.runtime.lastError) {
                    Logger.error('Daily notification failed:', chrome.runtime.lastError.message);
                } else {
                    Logger.info('Daily notification created with ID:', notificationId);
                }
            });
            
        } catch (error) {
            Logger.error('Failed to create notification (caught exception):', error);
            Logger.error('Error stack:', error.stack);
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
            
            const iconUrl = chrome.runtime.getURL('assets/icon-48.png');
            chrome.notifications.create(`deadlineAlert_${goalIndex}`, {
                type: 'basic',
                iconUrl: iconUrl,
                title: 'Memento Mori - Deadline Alert',
                message: message
            });
        }
    }

    calculateDaysLeft(age, continent) {
        // Use shared helper function
        return Helpers.calculateDaysLeft(age, continent);
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
                Logger.warn('Invalid URL:', url);
                return;
            }
            
            const currentTime = new Date();
            
            Logger.debug('CHECKING SITE:', hostname, 'at', currentTime.toLocaleTimeString());
            Logger.debug('Active schedules:', result.blockingSchedules?.length || 0);
            
            // IMPROVED BLOCKING CHECK
            if (this.shouldBlockSite(hostname, currentTime, result.blockingSchedules || [])) {
                Logger.info('BLOCKING SITE:', hostname);
                
                // FORCE REDIRECT to blocked page
                const blockedUrl = chrome.runtime.getURL('blocked.html') + '?site=' + encodeURIComponent(hostname) + '&blocked_at=' + Date.now();
                
                try {
                    await chrome.tabs.update(tabId, { url: blockedUrl });
                    Logger.info('SUCCESSFULLY BLOCKED and redirected to:', blockedUrl);
                } catch (redirectError) {
                    Logger.error('REDIRECT FAILED:', redirectError);
                    // Try alternative method
                    try {
                        chrome.tabs.reload(tabId);
                        setTimeout(() => {
                            chrome.tabs.update(tabId, { url: blockedUrl });
                        }, 100);
                    } catch (altError) {
                        Logger.error('ALTERNATIVE REDIRECT FAILED:', altError);
                    }
                }
            }
        } catch (error) {
            Logger.error('ERROR in checkAndBlockSite:', error);
        }
    }

    shouldBlockSite(hostname, currentTime, blockingSchedules) {
        if (!blockingSchedules || blockingSchedules.length === 0) {
            Logger.debug('No blocking schedules found');
            return false;
        }
        
        const activeSchedules = blockingSchedules.filter(schedule => schedule.active);
            Logger.debug('Active schedules:', activeSchedules.length);
        
        for (const schedule of activeSchedules) {
            Logger.debug('Checking schedule:', schedule.name, 'for time:', currentTime.toLocaleTimeString());
            
            // Check if current time is in schedule
            if (!this.isBlockingTimeActive(currentTime, schedule)) {
                Logger.debug('Time not in schedule range');
                continue;
            }
            
            // IMPROVED SITE MATCHING LOGIC - More precise to prevent false positives
            if (schedule.blockedSites && schedule.blockedSites.length > 0) {
                for (const site of schedule.blockedSites) {
                    const siteLower = site.toLowerCase().trim();
                    const hostnameLower = hostname.toLowerCase();
                    
                    // Remove www. prefix for better matching
                    const cleanHostname = hostnameLower.replace(/^www\./, '');
                    const cleanSite = siteLower.replace(/^www\./, '');
                    
                    // More precise matching strategies to prevent false positives
                    // Removed includes() checks that could match incorrectly (e.g., "reddit.com" matching "preddit.com")
                    const isMatch = 
                        cleanHostname === cleanSite ||                    // Exact match (e.g., "reddit.com" === "reddit.com")
                        cleanHostname.endsWith('.' + cleanSite) ||       // Subdomain match (e.g., "www.reddit.com" or "m.reddit.com" matches "reddit.com")
                        cleanSite.endsWith('.' + cleanHostname) ||       // Parent domain match (rare case)
                        cleanHostname.split('.').slice(-2).join('.') === cleanSite.split('.').slice(-2).join('.'); // Same base domain (e.g., "m.facebook.com" matches "facebook.com")
                    
                    if (isMatch) {
                        Logger.info('BLOCKING MATCH FOUND!', { hostname, cleanHostname, cleanSite });
                        return true;
                    }
                }
            }
        }
        
            Logger.debug('Site not blocked');
        return false;
    }

    isBlockingTimeActive(currentTime, schedule) {
        const currentDay = currentTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const currentHour = currentTime.getHours();
        const currentMinute = currentTime.getMinutes();
        const currentTimeMinutes = currentHour * 60 + currentMinute;

        // Check if current day is in schedule
        if (!schedule.days || !schedule.days.includes(currentDay)) {
            Logger.debug('Current day', currentDay, 'not in schedule days:', schedule.days);
            return false;
        }
        
        // Check if current time is in schedule
        const startTime = this.parseTime(schedule.startTime);
        const endTime = this.parseTime(schedule.endTime);
        
        Logger.debug('Time check:', currentTimeMinutes, 'vs', startTime, '-', endTime);
        
        let isInTimeRange = false;
        if (startTime <= endTime) {
            isInTimeRange = currentTimeMinutes >= startTime && currentTimeMinutes <= endTime;
        } else {
            // Handle overnight schedules
            isInTimeRange = currentTimeMinutes >= startTime || currentTimeMinutes <= endTime;
        }
        
        Logger.debug('Is in time range:', isInTimeRange);
        return isInTimeRange;
    }

    parseTime(timeString) {
        // Use shared helper function
        return Helpers.parseTime(timeString);
    }

    async trackWastedTime() {
        const result = await chrome.storage.local.get(['dailyStats']);
        
        // FIXED WASTED TIME - Only count time since this specific visit started
        const currentTime = Date.now();
        let timeWastedThisVisit = 5; // Default 5 seconds if we can't calculate exact time
        
        // Only calculate if we have a recent start time (max 10 minutes ago to avoid huge numbers)
        if (this.activeTabId && this.tabStartTimes.has(this.activeTabId)) {
            const startTime = this.tabStartTimes.get(this.activeTabId);
            const timeSinceStart = Math.floor((currentTime - startTime) / 1000);
            
            // Only use calculated time if it's reasonable (under 10 minutes)
            if (timeSinceStart > 0 && timeSinceStart <= 600) {
                timeWastedThisVisit = timeSinceStart;
            }
        }
        
        // Update DAILY stats only (no more cumulative bullshit)
        const today = new Date().toDateString();
        const dailyStats = result.dailyStats || {};
        if (!dailyStats[today]) {
            dailyStats[today] = { blocked: 0, productive: 0, totalTime: 0, savedTime: 0 };
        }
        dailyStats[today].blocked += 1; // Block attempt count
        dailyStats[today].savedTime = (dailyStats[today].savedTime || 0) + timeWastedThisVisit;
        
        await chrome.storage.local.set({ 
            dailyStats: dailyStats
        });
        
        const totalWastedToday = dailyStats[today].wastedTime;
        console.log(`💸 WASTED TIME: +${timeWastedThisVisit}s this visit, ${Math.floor(totalWastedToday/60)}m today`);
        
        // Notify popup with TODAY'S wasted time only
        try {
            chrome.runtime.sendMessage({
                action: 'updateWastedTime',
                time: totalWastedToday // Send today's total, not cumulative
            }, () => {
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
                    
                case 'updateIdleState':
                    // Update smart idle state from content script
                    this.smartIdleState = {
                        isIdle: request.isIdle,
                        ...request.idleDetails
                    };
                    console.log('🧠 Smart idle state updated:', this.smartIdleState.isIdle ? 'IDLE' : 'ACTIVE');
                    sendResponse({ success: true });
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
                    // Now resets saved time instead
                    await this.resetSavedTime();
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

    async updateScreenTimeEverySecond() {
        // FIXED SCREEN TIME TRACKING - Track active tab regardless of focus/idle state
        try {
            // Get active tab in focused window
            const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            
            if (activeTab && activeTab.url && !activeTab.url.startsWith("chrome-extension://") && !activeTab.url.startsWith("chrome://") && !activeTab.url.startsWith("about:")) {
                const hostname = new URL(activeTab.url).hostname.toLowerCase();
                
                // Update our tracking
                this.activeTabId = activeTab.id;
                
                // Add 1 second to screen time - ALWAYS TRACK
                await this.recordScreenTime(hostname, 1);
                
                console.log(`📊 Screen time +1s: ${hostname}`);
            }
        } catch (error) {
            console.log("Error updating screen time:", error);
        }
    }

    async updateSavedTimeEverySecond() {
        // Check if any blocking schedule is currently active
        try {
            const result = await chrome.storage.local.get(['blockingSchedules']);
            const schedules = result.blockingSchedules || [];
            const currentTime = new Date();
            
            // Find active schedules
            const activeSchedules = schedules.filter(schedule => {
                return schedule.active && this.isBlockingTimeActive(currentTime, schedule);
            });
            
            this.currentlyActiveSchedules = activeSchedules;
            
            // If any schedule is active, add 1 second to saved time
            if (activeSchedules.length > 0) {
                await this.recordSavedTime(1);
                console.log(`💾 Saved time +1s (${activeSchedules.length} active schedules)`);
            }
            
        } catch (error) {
            console.log('Error updating saved time:', error);
        }
    }

    async recordSavedTime(seconds) {
        const today = new Date().toDateString();
        const result = await chrome.storage.local.get(['dailyStats']);
        const dailyStats = result.dailyStats || {};
        
        if (!dailyStats[today]) {
            dailyStats[today] = { totalTime: 0, sites: {}, savedTime: 0, untracked: {} };
        }
        
        dailyStats[today].savedTime = (dailyStats[today].savedTime || 0) + seconds;
        
        await chrome.storage.local.set({ dailyStats: dailyStats });
        
        // Only notify popup every 10 seconds to reduce message spam
        const now = Date.now();
        if (!this.lastSavedTimeUpdate || (now - this.lastSavedTimeUpdate) > 10000) {
            this.lastSavedTimeUpdate = now;
            
            try {
                chrome.runtime.sendMessage({
                    action: 'updateSavedTime',
                    time: dailyStats[today].savedTime,
                    activeSchedules: this.currentlyActiveSchedules.length
                });
            } catch (error) {
                // Popup may not be open
            }
        }
    }

    async checkScheduleNotifications() {
        try {
            const result = await chrome.storage.local.get(['blockingSchedules', 'sentNotificationsToday']);
            const schedules = result.blockingSchedules || [];
            const now = new Date();
            const today = new Date().toDateString();
            
            // Get today's sent notifications or initialize empty object
            const sentToday = result.sentNotificationsToday || {};
            if (!sentToday[today]) {
                sentToday[today] = {};
            }
            
            const currentTime = now.getHours() * 60 + now.getMinutes();
            
            for (const schedule of schedules) {
                if (!schedule.active) continue;
                
                const startTime = this.parseTime(schedule.startTime);
                const endTime = this.parseTime(schedule.endTime);
                const scheduleKey = schedule.name.replace(/\s+/g, '_'); // Remove spaces for key
                
                // Check for 5 minutes before schedule start - EXACT TIME ONLY
                const fiveMinutesBefore = startTime - 5;
                const notificationKey1 = `${scheduleKey}_starting_soon`;
                if (currentTime === fiveMinutesBefore && !sentToday[today][notificationKey1]) {
                    await this.sendScheduleNotification(schedule.name, 'starting_soon');
                    sentToday[today][notificationKey1] = true;
                    console.log(`✅ Sent 5-min warning for ${schedule.name}`);
                }
                
                // Check for schedule start - EXACT TIME ONLY
                const notificationKey2 = `${scheduleKey}_started`;
                if (currentTime === startTime && !sentToday[today][notificationKey2]) {
                    await this.sendScheduleNotification(schedule.name, 'started');
                    sentToday[today][notificationKey2] = true;
                    console.log(`✅ Sent start notification for ${schedule.name}`);
                }
                
                // Check for schedule end - EXACT TIME ONLY
                const notificationKey3 = `${scheduleKey}_ended`;
                let scheduleEndTime = endTime;
                if (startTime > endTime) {
                    // Handle overnight schedules
                    scheduleEndTime = endTime + (24 * 60);
                    if (currentTime === endTime && !sentToday[today][notificationKey3]) {
                        await this.sendScheduleNotification(schedule.name, 'ended');
                        sentToday[today][notificationKey3] = true;
                        console.log(`✅ Sent end notification for ${schedule.name} (overnight)`);
                    }
                } else {
                    if (currentTime === scheduleEndTime && !sentToday[today][notificationKey3]) {
                        await this.sendScheduleNotification(schedule.name, 'ended');
                        sentToday[today][notificationKey3] = true;
                        console.log(`✅ Sent end notification for ${schedule.name}`);
                    }
                }
            }
            
            // Save updated notification tracking
            await chrome.storage.local.set({ sentNotificationsToday: sentToday });
            
        } catch (error) {
            console.log('Error checking schedule notifications:', error);
        }
    }

    async sendScheduleNotification(scheduleName, type) {
        let message, title;
        
        switch (type) {
            case 'starting_soon':
                title = 'Schedule Starting Soon';
                message = `"${scheduleName}" will start in 5 minutes. Get ready to focus!`;
                break;
            case 'started':
                title = 'Schedule Started';
                message = `"${scheduleName}" is now active. Time to focus!`;
                break;
            case 'ended':
                title = 'Schedule Ended';
                message = `"${scheduleName}" has ended. Great job staying focused!`;
                break;
            default:
                return;
        }
        
        try {
            const iconUrl = chrome.runtime.getURL('assets/icon-48.png');
            chrome.notifications.create(`schedule_${type}_${Date.now()}`, {
                type: 'basic',
                iconUrl: iconUrl,
                title: title,
                message: message
            });
            console.log(`🔔 Schedule notification: ${message}`);
        } catch (error) {
            console.log('Error sending schedule notification:', error);
        }
    }

    async resetSavedTime() {
        const today = new Date().toDateString();
        const result = await chrome.storage.local.get(['dailyStats']);
        const dailyStats = result.dailyStats || {};
        
        if (dailyStats[today]) {
            dailyStats[today].savedTime = 0;
            await chrome.storage.local.set({ dailyStats: dailyStats });
        }
    }

    async initializeActiveTab() {
        try {
            // Get current active tab
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab) {
                this.activeTabId = activeTab.id;
                console.log('🎯 Initialized with active tab:', activeTab.id, activeTab.url);
            }
        } catch (error) {
            console.log('Error initializing active tab:', error);
        }
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