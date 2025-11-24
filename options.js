/* global chrome */

class OptionsManager {
    constructor() {
        this.editingScheduleIndex = -1;
        this.init();
        this.activateServiceWorker(); // FORCE SERVICE WORKER ACTIVATION
    }

    async activateServiceWorker() {
        console.log('🔥 FORCE ACTIVATING SERVICE WORKER FROM OPTIONS...');
        try {
            // Send activation message
            chrome.runtime.sendMessage({ action: 'activateServiceWorker' }, (response) => {
                console.log('✅ Service worker response:', response);
            });
            
            // Trigger blocking rule update
            chrome.runtime.sendMessage({ action: 'updateBlockingRules' }, (response) => {
                console.log('🔄 Blocking rules updated:', response);
            });
            
            console.log('🚀 Service worker activation triggered!');
        } catch (error) {
            console.error('❌ Service worker activation error:', error);
        }
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.updateDisplay();
        this.setupStorageListener();
    }

    setupStorageListener() {
        // Listen for storage changes to refresh the display
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local') {
                // Reload settings when storage changes
                this.loadSettings().then(() => {
                    this.updateDisplay();
                });
            }
        });
    }

    async loadSettings() {
        // Get ALL settings to ensure we have everything
        const result = await chrome.storage.local.get([
            'birthdate', 'userAge', 'userContinent', 'dailyNotifications', 'notificationTime',
            'blockingSchedules', 'youtubeSettings', 'strictMode', 'strictModePin', 'privacyAccepted',
            'blockedSites', 'allowedSites'
        ]);

        console.log('📥 Loading settings from storage:', result);

        // Ensure we properly handle all values, including empty strings
        this.settings = {
            birthdate: result.birthdate !== undefined ? result.birthdate : '',
            userAge: result.userAge || 0,
            userContinent: result.userContinent || 'North America',
            dailyNotifications: result.dailyNotifications !== undefined ? result.dailyNotifications : true,
            notificationTime: result.notificationTime || '09:00',
            blockingSchedules: result.blockingSchedules || [],
            youtubeSettings: result.youtubeSettings || {
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
            },
            strictMode: result.strictMode || false,
            strictModePin: result.strictModePin || '',
            privacyAccepted: result.privacyAccepted || false,
            blockedSites: result.blockedSites || [],
            allowedSites: result.allowedSites || []
        };

        console.log('✅ Settings loaded:', this.settings);
    }

    setupEventListeners() {
        // Personal Info Save Button
        document.getElementById('savePersonalBtn').addEventListener('click', () => {
            this.savePersonalInfo();
        });

        // YouTube Settings Save Button
        document.getElementById('saveYouTubeBtn').addEventListener('click', () => {
            this.saveYouTubeSettings();
        });

        // Strict Mode Save Button
        document.getElementById('saveStrictBtn').addEventListener('click', () => {
            this.saveStrictMode();
        });

        // Show Schedule Form Button
        document.getElementById('showScheduleFormBtn').addEventListener('click', () => {
            this.showScheduleForm();
        });

        // Create Schedule Button
        document.getElementById('createScheduleBtn').addEventListener('click', () => {
            this.createOrUpdateSchedule();
        });

        // Cancel Edit Button
        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            this.cancelEdit();
        });

        // Change PIN Button
        document.getElementById('changePinBtn').addEventListener('click', () => {
            this.changePIN();
        });

        // Strict mode checkbox
        document.getElementById('strictMode').addEventListener('change', (e) => {
            const pinGroup = document.getElementById('pinGroup');
            const pinInput = document.getElementById('strictPin');
            const changePinBtn = document.getElementById('changePinBtn');
            
            if (e.target.checked) {
                pinGroup.style.display = 'block';
                if (!this.settings.strictModePin) {
                    pinInput.disabled = false;
                    pinInput.classList.remove('locked-input');
                    changePinBtn.style.display = 'none';
                } else {
                    pinInput.disabled = true;
                    pinInput.classList.add('locked-input');
                    changePinBtn.style.display = 'inline-block';
                }
            } else {
                pinGroup.style.display = 'none';
                changePinBtn.style.display = 'none';
            }
        });

        // Schedule action buttons - will be added dynamically
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('edit-schedule-btn')) {
                const index = parseInt(e.target.dataset.index);
                this.editSchedule(index);
            } else if (e.target.classList.contains('toggle-schedule-btn')) {
                const index = parseInt(e.target.dataset.index);
                this.toggleSchedule(index);
            } else if (e.target.classList.contains('delete-schedule-btn')) {
                const index = parseInt(e.target.dataset.index);
                this.deleteSchedule(index);
            } else if (e.target.classList.contains('add-site-btn')) {
                this.addSiteInput();
            } else if (e.target.classList.contains('remove-site-btn')) {
                e.target.closest('.site-input-row').remove();
                this.updateSiteInputsDisplay();
            } else if (e.target.classList.contains('quick-add-btn')) {
                // Quick add popular sites
                const site = e.target.dataset.site;
                this.quickAddSite(site);
            }
        });

        // IMPROVED: Add enter key support for adding sites
        document.addEventListener('keypress', (e) => {
            if (e.target.classList.contains('site-input') && e.key === 'Enter') {
                this.addSiteInput();
            }
        });
    }

    updateDisplay() {
        console.log('🔄 Updating display with settings:', this.settings);
        
        // Personal Info - ensure values are set correctly
        const birthdateInput = document.getElementById('birthdate');
        if (birthdateInput) {
            birthdateInput.value = this.settings.birthdate || '';
            console.log('📅 Birthdate set to:', birthdateInput.value);
        }
        
        const continentSelect = document.getElementById('userContinent');
        if (continentSelect) {
            continentSelect.value = this.settings.userContinent || 'North America';
            console.log('🌍 Continent set to:', continentSelect.value);
        }
        
        const notificationsCheckbox = document.getElementById('dailyNotifications');
        if (notificationsCheckbox) {
            notificationsCheckbox.checked = this.settings.dailyNotifications !== false;
            console.log('🔔 Notifications set to:', notificationsCheckbox.checked);
        }
        
        const notificationTimeInput = document.getElementById('notificationTime');
        if (notificationTimeInput) {
            notificationTimeInput.value = this.settings.notificationTime || '09:00';
            console.log('⏰ Notification time set to:', notificationTimeInput.value);
        }
        
        // Privacy Accepted checkbox
        const privacyCheckbox = document.getElementById('privacyAccepted');
        if (privacyCheckbox) {
            privacyCheckbox.checked = this.settings.privacyAccepted || false;
            console.log('🔒 Privacy accepted set to:', privacyCheckbox.checked);
        }

        // YouTube Settings
        const youtubeSettings = this.settings.youtubeSettings;
        document.getElementById('hideHome').checked = youtubeSettings.hideHome || false;
        document.getElementById('hideShorts').checked = youtubeSettings.hideShorts || false;
        document.getElementById('hideComments').checked = youtubeSettings.hideComments || false;
        document.getElementById('hideRecommended').checked = youtubeSettings.hideRecommended || false;
        document.getElementById('hideSubscriptions').checked = youtubeSettings.hideSubscriptions || false;
        document.getElementById('hideExplore').checked = youtubeSettings.hideExplore || false;
        document.getElementById('hideTrends').checked = youtubeSettings.hideTrends || false;
        document.getElementById('hideTopBar').checked = youtubeSettings.hideTopBar || false;
        document.getElementById('disableEndCards').checked = youtubeSettings.disableEndCards || false;
        document.getElementById('disableAutoplay').checked = youtubeSettings.disableAutoplay || false;
        document.getElementById('blackAndWhite').checked = youtubeSettings.blackAndWhite || false;

        // Strict Mode
        document.getElementById('strictMode').checked = this.settings.strictMode;
        const pinInput = document.getElementById('strictPin');
        const pinGroup = document.getElementById('pinGroup');
        const changePinBtn = document.getElementById('changePinBtn');
        
        if (this.settings.strictMode && this.settings.strictModePin) {
            // PIN is already set - show locked state
            pinInput.value = '••••';
            pinInput.disabled = true;
            pinInput.classList.add('locked-input');
            pinInput.placeholder = 'PIN is locked in Strict Mode';
            pinGroup.style.display = 'block';
            changePinBtn.style.display = 'inline-block';
        } else if (this.settings.strictMode) {
            // Strict mode enabled but no PIN set
            pinInput.value = '';
            pinInput.disabled = false;
            pinInput.classList.remove('locked-input');
            pinGroup.style.display = 'block';
            changePinBtn.style.display = 'none';
        } else {
            // Strict mode disabled
            pinGroup.style.display = 'none';
            changePinBtn.style.display = 'none';
        }

        // Load schedules
        this.loadSchedules();
    }

    showScheduleForm() {
        const form = document.getElementById('scheduleForm');
        const button = document.getElementById('showScheduleFormBtn');
        
        if (form.classList.contains('hidden')) {
            form.classList.remove('hidden');
            button.textContent = '❌ Cancel';
            this.clearScheduleForm();
        } else {
            form.classList.add('hidden');
            button.textContent = '➕ Create New Schedule';
            this.cancelEdit();
        }
    }

    addSiteInput() {
        const container = document.getElementById('siteInputs');
        const currentInputs = container.querySelectorAll('.site-input');
        
        // Check if the last input is empty before adding a new one
        const lastInput = currentInputs[currentInputs.length - 1];
        if (lastInput && !lastInput.value.trim()) {
            lastInput.focus();
            return;
        }

        const row = document.createElement('div');
        row.className = 'site-input-row';
        row.innerHTML = `
            <div class="site-input-container">
                <input type="text" class="form-input site-input" placeholder="Type website name and press Enter (e.g., facebook.com)">
                <button type="button" class="remove-site-btn" title="Remove this site">✖</button>
            </div>
        `;
        container.appendChild(row);
        
        // Focus on the new input
        const newInput = row.querySelector('.site-input');
        newInput.focus();
        
        this.updateSiteInputsDisplay();
    }

    quickAddSite(site) {
        const container = document.getElementById('siteInputs');
        const inputs = container.querySelectorAll('.site-input');
        
        // Check if site is already added
        const existingSites = this.getSiteInputs();
        if (existingSites.includes(site)) {
            this.showToast(`${site} is already in the list!`, 'warning');
            return;
        }
        
        // Find the first empty input or create a new one
        let targetInput = null;
        for (const input of inputs) {
            if (!input.value.trim()) {
                targetInput = input;
                break;
            }
        }
        
        if (!targetInput) {
            this.addSiteInput();
            const newInputs = container.querySelectorAll('.site-input');
            targetInput = newInputs[newInputs.length - 1];
        }
        
        if (targetInput) {
            targetInput.value = site;
            targetInput.focus();
            this.showToast(`Added ${site} to block list!`);
        }
    }

    updateSiteInputsDisplay() {
        const container = document.getElementById('siteInputs');
        const rows = container.querySelectorAll('.site-input-row');
        
        // Show remove button only if there's more than one input
        rows.forEach((row, index) => {
            const removeBtn = row.querySelector('.remove-site-btn');
            if (rows.length > 1) {
                removeBtn.style.display = 'block';
            } else {
                removeBtn.style.display = 'none';
            }
        });
    }

    getSiteInputs() {
        const inputs = document.querySelectorAll('.site-input');
        const sites = [];
        inputs.forEach(input => {
            if (input.value.trim()) {
                let site = input.value.trim().toLowerCase();
                // Remove protocol if present
                site = site.replace(/^https?:\/\//, '');
                // Remove www. if present
                site = site.replace(/^www\./, '');
                // Remove trailing slashes and paths
                site = site.split('/')[0];
                if (site) {
                    sites.push(site);
                }
            }
        });
        return [...new Set(sites)]; // Remove duplicates
    }

    setSiteInputs(sites) {
        const container = document.getElementById('siteInputs');
        container.innerHTML = '';
        
        if (sites.length === 0) {
            // Add one empty input
            this.addSiteInput();
        } else {
            sites.forEach((site) => {
                const row = document.createElement('div');
                row.className = 'site-input-row';
                row.innerHTML = `
                    <div class="site-input-container">
                        <input type="text" class="form-input site-input" value="${site}" placeholder="Type website name and press Enter">
                        <button type="button" class="remove-site-btn" title="Remove this site">✖</button>
                    </div>
                `;
                container.appendChild(row);
            });
            
            // Add one more empty input for adding new sites
            this.addSiteInput();
        }
        
        this.updateSiteInputsDisplay();
    }

    calculateAge(birthdate) {
        // Use shared helper function
        return Helpers.calculateAge(birthdate);
    }

    async savePersonalInfo() {
        const birthdate = document.getElementById('birthdate').value;
        const continent = document.getElementById('userContinent').value;
        const notifications = document.getElementById('dailyNotifications').checked;
        const notificationTime = document.getElementById('notificationTime').value;
        const privacyAccepted = document.getElementById('privacyAccepted').checked;

        if (!birthdate) {
            alert('Please enter your birthdate');
            return;
        }

        if (!privacyAccepted) {
            alert('Please accept the privacy policy to continue');
            return;
        }

        const age = this.calculateAge(birthdate);
        if (age < 0 || age > 150) {
            alert('Please enter a valid birthdate');
            return;
        }

        await chrome.storage.local.set({
            birthdate: birthdate,
            userAge: age,
            userContinent: continent,
            dailyNotifications: notifications,
            notificationTime: notificationTime,
            privacyAccepted: true
        });

        this.showToast('Personal information saved successfully!');
        
        // Setup daily notifications with custom time
        if (notifications) {
            try {
                chrome.runtime.sendMessage({ action: 'updateNotificationTime' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log('Background script not responding:', chrome.runtime.lastError.message);
                        // Try direct alarm setup as fallback
                        chrome.alarms.clear('dailyReminder');
                        const notificationTime = document.getElementById('notificationTime').value || '09:00';
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
        } else {
            chrome.alarms.clear('dailyReminder');
        }
    }

    async saveYouTubeSettings() {
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
            disableAutoplay: document.getElementById('disableAutoplay').checked,
            blackAndWhite: document.getElementById('blackAndWhite').checked
        };

        await chrome.storage.local.set({ youtubeSettings });

        // Notify content scripts about the update
        const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'updateYouTubeSettings',
                settings: youtubeSettings
            });
        });

        this.showToast('YouTube settings saved successfully!');
    }

    async saveStrictMode() {
        const strictMode = document.getElementById('strictMode').checked;
        const pin = document.getElementById('strictPin').value;

        // BUG FIX: If disabling strict mode and it was previously enabled, require PIN
        if (!strictMode && this.settings.strictMode && this.settings.strictModePin) {
            const enteredPin = prompt('🔒 Enter your PIN to disable Strict Mode:');
            if (enteredPin !== this.settings.strictModePin) {
                alert('❌ Incorrect PIN! Strict Mode cannot be disabled.');
                // Re-check the checkbox
                document.getElementById('strictMode').checked = true;
                return;
            }
        }

        if (strictMode && !this.settings.strictModePin) {
            // Setting PIN for first time
            if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
                alert('Please enter a valid 4-digit PIN');
                return;
            }
        }

        await chrome.storage.local.set({
            strictMode: strictMode,
            strictModePin: strictMode ? (this.settings.strictModePin || pin) : ''
        });

        this.settings.strictMode = strictMode;
        if (strictMode && !this.settings.strictModePin) {
            this.settings.strictModePin = pin;
        }

        this.showToast('Strict mode settings saved successfully!');
        this.updateDisplay(); // Refresh to show locked state
    }

    async changePIN() {
        const currentPin = prompt('Enter your current PIN:');
        if (!currentPin || currentPin !== this.settings.strictModePin) {
            alert('❌ Incorrect current PIN!');
            return;
        }

        const newPin = prompt('Enter your new 4-digit PIN:');
        if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
            alert('Please enter a valid 4-digit PIN');
            return;
        }

        const confirmPin = prompt('Confirm your new PIN:');
        if (newPin !== confirmPin) {
            alert('PINs do not match!');
            return;
        }

        await chrome.storage.local.set({ strictModePin: newPin });
        this.settings.strictModePin = newPin;
        
        this.showToast('PIN changed successfully!');
    }

    getSelectedDays() {
        const days = [];
        for (let i = 0; i < 7; i++) {
            if (document.getElementById(`day${i}`).checked) {
                days.push(i);
            }
        }
        return days;
    }

    createOrUpdateSchedule() {
        const name = document.getElementById('scheduleName').value.trim();
        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;
        const days = this.getSelectedDays();
        const blockedSites = this.getSiteInputs();

        if (!name) {
            alert('Please enter a schedule name');
            return;
        }

        if (!startTime || !endTime) {
            alert('Please select both start and end times');
            return;
        }

        if (days.length === 0) {
            alert('Please select at least one day');
            return;
        }

        if (blockedSites.length === 0) {
            alert('Please add at least one website to block');
            return;
        }

        // BUG FIX: If updating existing schedule and strict mode is enabled, require PIN
        if (this.editingScheduleIndex >= 0 && this.settings.strictMode && this.settings.strictModePin) {
            const enteredPin = prompt('🔒 Enter your PIN to update this schedule:');
            if (enteredPin !== this.settings.strictModePin) {
                alert('❌ Incorrect PIN! Schedule cannot be updated.');
                return;
            }
        }

        const scheduleData = {
            name: name,
            startTime: startTime,
            endTime: endTime,
            days: days,
            blockedSites: blockedSites,
            active: true,
            createdAt: new Date().toISOString()
        };

        if (this.editingScheduleIndex >= 0) {
            // Update existing schedule
            this.settings.blockingSchedules[this.editingScheduleIndex] = scheduleData;
            this.showToast('Schedule updated successfully!');
        } else {
            // Create new schedule
            this.settings.blockingSchedules.push(scheduleData);
            this.showToast('New schedule created successfully!');
        }

        chrome.storage.local.set({ blockingSchedules: this.settings.blockingSchedules });
        chrome.runtime.sendMessage({ action: 'updateBlockingRules' });
        
        // Hide form and reset
        document.getElementById('scheduleForm').classList.add('hidden');
        document.getElementById('showScheduleFormBtn').textContent = '➕ Create New Schedule';
        this.clearScheduleForm();
        this.loadSchedules();
    }

    editSchedule(index) {
        const schedule = this.settings.blockingSchedules[index];
        
        // BUG FIX: Require PIN verification if strict mode is enabled
        if (this.settings.strictMode && this.settings.strictModePin) {
            const enteredPin = prompt('🔒 Enter your PIN to edit this schedule:');
            if (enteredPin !== this.settings.strictModePin) {
                alert('❌ Incorrect PIN! Schedule cannot be edited.');
                return;
            }
        }
        
        this.editingScheduleIndex = index;

        // Show form
        document.getElementById('scheduleForm').classList.remove('hidden');
        document.getElementById('showScheduleFormBtn').textContent = '❌ Cancel';

        // Populate form with schedule data
        document.getElementById('scheduleName').value = schedule.name;
        document.getElementById('startTime').value = schedule.startTime;
        document.getElementById('endTime').value = schedule.endTime;
        this.setSiteInputs(schedule.blockedSites);

        // Clear all day checkboxes first
        for (let i = 0; i < 7; i++) {
            document.getElementById(`day${i}`).checked = false;
        }

        // Set selected days
        schedule.days.forEach(day => {
            document.getElementById(`day${day}`).checked = true;
        });

        // Update button text and show cancel button
        document.getElementById('createScheduleBtn').textContent = 'Update Schedule';
        document.getElementById('cancelEditBtn').style.display = 'inline-block';

        // Scroll to form
        document.getElementById('scheduleForm').scrollIntoView({ behavior: 'smooth' });
    }

    cancelEdit() {
        this.editingScheduleIndex = -1;
        this.clearScheduleForm();
        document.getElementById('createScheduleBtn').textContent = 'Create Schedule';
        document.getElementById('cancelEditBtn').style.display = 'none';
    }

    clearScheduleForm() {
        document.getElementById('scheduleName').value = '';
        document.getElementById('startTime').value = '09:00';
        document.getElementById('endTime').value = '17:00';
        this.setSiteInputs([]);
        
        // Reset to no days selected
        for (let i = 0; i < 7; i++) {
            document.getElementById(`day${i}`).checked = false;
        }
    }

    async toggleSchedule(index) {
        const schedule = this.settings.blockingSchedules[index];
        
        // Check if PIN verification is needed for deactivation
        if (schedule.active && this.settings.strictMode && this.settings.strictModePin) {
            const enteredPin = prompt('🔒 Enter your PIN to deactivate this schedule:');
            if (enteredPin !== this.settings.strictModePin) {
                alert('❌ Incorrect PIN! Schedule cannot be deactivated.');
                return;
            }
        }
        
        schedule.active = !schedule.active;
        await chrome.storage.local.set({ blockingSchedules: this.settings.blockingSchedules });
        chrome.runtime.sendMessage({ action: 'updateBlockingRules' });
        this.loadSchedules();
        this.showToast(`Schedule ${schedule.active ? 'activated' : 'deactivated'}!`);
    }

    async deleteSchedule(index) {
        const schedule = this.settings.blockingSchedules[index];
        
        // Check if PIN verification is needed for deletion
        if (this.settings.strictMode && this.settings.strictModePin) {
            const enteredPin = prompt('🔒 Enter your PIN to delete this schedule:');
            if (enteredPin !== this.settings.strictModePin) {
                alert('❌ Incorrect PIN! Schedule cannot be deleted.');
                return;
            }
        }
        
        if (confirm('Are you sure you want to delete this schedule?')) {
            this.settings.blockingSchedules.splice(index, 1);
            await chrome.storage.local.set({ blockingSchedules: this.settings.blockingSchedules });
            chrome.runtime.sendMessage({ action: 'updateBlockingRules' });
            this.loadSchedules();
            this.showToast('Schedule deleted successfully!');
        }
    }

    loadSchedules() {
        const schedulesList = document.getElementById('schedulesList');
        schedulesList.innerHTML = '';

        if (this.settings.blockingSchedules.length === 0) {
            schedulesList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #888;">
                    <p>No blocking schedules created yet.</p>
                    <p>Click "Create New Schedule" to get started!</p>
                </div>
            `;
            return;
        }

        this.settings.blockingSchedules.forEach((schedule, index) => {
            const scheduleItem = document.createElement('div');
            scheduleItem.className = 'schedule-item';
            scheduleItem.innerHTML = `
                <div class="schedule-header">
                    <div class="schedule-name">${schedule.name || `Schedule ${index + 1}`}</div>
                    <div class="schedule-status ${schedule.active ? 'status-active' : 'status-inactive'}">
                        ${schedule.active ? 'Active' : 'Inactive'}
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
                    <div>
                        <strong>Time:</strong> ${schedule.startTime} - ${schedule.endTime}
                    </div>
                    <div>
                        <strong>Days:</strong> ${this.formatDays(schedule.days)}
                    </div>
                    <div>
                        <strong>Sites:</strong> ${schedule.blockedSites?.length || 0} blocked
                    </div>
                </div>
                <div style="margin-bottom: 15px;">
                    <strong>Blocked Sites:</strong><br>
                    <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px;">
                        ${(schedule.blockedSites || []).map(site => 
                            `<span style="background: rgba(255,107,107,0.2); color: #ff6b6b; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${site}</span>`
                        ).join('')}
                    </div>
                </div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="btn btn-secondary edit-schedule-btn" data-index="${index}">
                        ✏️ Edit
                    </button>
                    <button class="btn btn-secondary toggle-schedule-btn" data-index="${index}">
                        ${schedule.active ? '⏸️ Deactivate' : '▶️ Activate'}
                    </button>
                    <button class="btn btn-danger delete-schedule-btn" data-index="${index}">
                        🗑️ Delete
                    </button>
                </div>
            `;
            schedulesList.appendChild(scheduleItem);
        });
    }

    formatDays(days) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        if (!days || days.length === 0) return 'No days selected';
        if (days.length === 7) return 'Every day';
        return days.map(day => dayNames[day]).join(', ');
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Initialize options manager
let optionsManager;
document.addEventListener('DOMContentLoaded', async () => {
    optionsManager = new OptionsManager();
    
    // Force a refresh after a short delay to ensure all data is loaded
    setTimeout(async () => {
        console.log('🔄 Force refreshing options page data...');
        await optionsManager.loadSettings();
        optionsManager.updateDisplay();
    }, 100);
});