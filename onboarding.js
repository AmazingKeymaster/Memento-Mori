/* global chrome */

class OnboardingManager {
    constructor() {
        this.blockedSites = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateCompleteButton();
    }

    setupEventListeners() {
        // Privacy checkbox - enable/disable complete button
        document.getElementById('privacyAccepted').addEventListener('change', () => {
            this.updateCompleteButton();
        });

        // Add site button
        document.getElementById('addSiteBtn').addEventListener('click', () => {
            this.addSite();
        });

        // Enter key on site input
        document.getElementById('siteInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addSite();
            }
        });

        // Quick add buttons
        document.querySelectorAll('.quick-add-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const site = btn.getAttribute('data-site');
                if (!this.blockedSites.includes(site)) {
                    this.blockedSites.push(site);
                    this.updateSitesList();
                    btn.classList.add('added');
                    btn.textContent = '✓ ' + btn.textContent.replace('✓ ', '');
                }
            });
        });

        // Complete setup button
        document.getElementById('completeSetupBtn').addEventListener('click', () => {
            this.completeSetup();
        });
    }

    addSite() {
        const input = document.getElementById('siteInput');
        const site = input.value.trim().toLowerCase();
        
        if (!site) return;
        
        // Remove protocol and www if present
        const cleanSite = site.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        
        if (cleanSite && !this.blockedSites.includes(cleanSite)) {
            this.blockedSites.push(cleanSite);
            this.updateSitesList();
            input.value = '';
        }
    }

    removeSite(site) {
        this.blockedSites = this.blockedSites.filter(s => s !== site);
        this.updateSitesList();
        
        // Reset quick add button if it was added
        document.querySelectorAll('.quick-add-btn').forEach(btn => {
            if (btn.getAttribute('data-site') === site) {
                btn.classList.remove('added');
                btn.textContent = btn.textContent.replace('✓ ', '');
            }
        });
    }

    updateSitesList() {
        const list = document.getElementById('sitesList');
        list.innerHTML = '';
        
        if (this.blockedSites.length === 0) {
            list.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 20px;">No sites added yet. Add sites you want to block.</p>';
            return;
        }
        
        this.blockedSites.forEach(site => {
            const tag = document.createElement('div');
            tag.className = 'site-tag';
            tag.innerHTML = `
                ${site}
                <span class="remove">×</span>
            `;
            const removeBtn = tag.querySelector('.remove');
            removeBtn.addEventListener('click', () => {
                this.removeSite(site);
            });
            list.appendChild(tag);
        });
    }

    updateCompleteButton() {
        const privacyAccepted = document.getElementById('privacyAccepted').checked;
        const birthdate = document.getElementById('birthdate').value;
        const btn = document.getElementById('completeSetupBtn');
        
        if (privacyAccepted && birthdate) {
            btn.disabled = false;
        } else {
            btn.disabled = true;
        }
    }

    async completeSetup() {
        const birthdate = document.getElementById('birthdate').value;
        const userContinent = document.getElementById('userContinent').value;
        const dailyNotifications = document.getElementById('dailyNotifications').checked;
        const notificationTime = document.getElementById('notificationTime').value;

        // Get YouTube settings
        const youtubeSettings = {
            hideHome: document.getElementById('hideHome').checked,
            hideShorts: document.getElementById('hideShorts').checked,
            hideComments: document.getElementById('hideComments').checked,
            hideRecommended: document.getElementById('hideRecommended').checked,
            hideSubscriptions: document.getElementById('hideSubscriptions').checked,
            hideExplore: document.getElementById('hideExplore').checked,
            hideTrends: document.getElementById('hideTrends').checked,
            hideTopBar: document.getElementById('hideTopBar').checked,
            disableEndCards: document.getElementById('disableEndCards').checked,
            blackAndWhite: document.getElementById('blackAndWhite').checked,
            disableAutoplay: document.getElementById('disableAutoplay').checked
        };

        // Calculate age from birthdate
        const today = new Date();
        const birth = new Date(birthdate);
        let userAge = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            userAge--;
        }

        // Create a default blocking schedule if sites were added
        let blockingSchedules = [];
        if (this.blockedSites.length > 0) {
            // Create a default "All Day" schedule with all the blocked sites
            blockingSchedules = [{
                name: 'Default Schedule',
                startTime: '00:00',
                endTime: '23:59',
                days: [0, 1, 2, 3, 4, 5, 6], // All days of the week
                blockedSites: this.blockedSites,
                active: true,
                createdAt: new Date().toISOString()
            }];
        }

        // Prepare all settings to save
        const settingsToSave = {
            initialized: true,
            onboardingCompleted: true,
            birthdate: birthdate,
            userAge: userAge,
            userContinent: userContinent,
            dailyNotifications: dailyNotifications,
            notificationTime: notificationTime,
            blockedSites: this.blockedSites, // Keep for backward compatibility
            youtubeSettings: youtubeSettings,
            blockingSchedules: blockingSchedules, // Include default schedule if sites were added
            allowedSites: [],
            strictMode: false,
            strictModePin: '',
            privacyAccepted: true, // Set privacy accepted flag
            wastedTime: 0,
            goals: [],
            dailyStats: {},
            weeklyStats: {},
            dailyTimeSpent: {}
        };

        console.log('💾 Saving onboarding data:', settingsToSave);

        // Save all settings
        await chrome.storage.local.set(settingsToSave);

        // Verify the data was saved
        const verification = await chrome.storage.local.get([
            'birthdate', 'userContinent', 'dailyNotifications', 'notificationTime', 
            'youtubeSettings', 'privacyAccepted', 'blockingSchedules'
        ]);
        console.log('✅ Verification - Data saved:', verification);

        if (!verification.birthdate || verification.birthdate !== birthdate) {
            console.error('❌ ERROR: Birthdate not saved correctly!');
            alert('Warning: There was an issue saving your birthdate. Please check the options page.');
        }

        // Update blocking rules in background script
        try {
            chrome.runtime.sendMessage({ action: 'updateBlockingRules' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('Background script not responding:', chrome.runtime.lastError.message);
                }
            });
        } catch (error) {
            console.log('Error updating blocking rules:', error);
        }

        // Setup daily notifications with custom time
        if (dailyNotifications) {
            try {
                chrome.runtime.sendMessage({ action: 'updateNotificationTime' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log('Background script not responding, setting up alarm directly');
                        // Fallback: set up alarm directly
                        chrome.alarms.clear('dailyReminder');
                        const [hours, minutes] = notificationTime.split(':').map(Number);
                        const now = new Date();
                        const nextTime = new Date(now);
                        nextTime.setHours(hours, minutes, 0, 0);
                        if (nextTime <= now) {
                            nextTime.setDate(nextTime.getDate() + 1);
                        }
                        chrome.alarms.create('dailyReminder', {
                            when: nextTime.getTime(),
                            periodInMinutes: 1440
                        });
                    }
                });
            } catch (error) {
                console.log('Error setting up notifications:', error);
            }
        }

        // Notify YouTube content scripts about settings update
        try {
            const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'updateYouTubeSettings',
                    settings: youtubeSettings
                }).catch(() => {
                    // Tab might not have content script loaded yet, ignore
                });
            });
        } catch (error) {
            console.log('Error updating YouTube tabs:', error);
        }

        // Show completion message
        alert('Onboarding complete! 🕯️\n\nYour settings have been saved. You can exit this page now.');
        
        // Don't close automatically - let user close it themselves
    }
}

// Initialize onboarding manager
const onboardingManager = new OnboardingManager();

// Update complete button when birthdate changes
document.getElementById('birthdate').addEventListener('change', () => {
    onboardingManager.updateCompleteButton();
});

