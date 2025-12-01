/* global chrome */

class MementoMori {
    constructor() {
        this.quotesWithAuthors = [
            { text: "Remember that you are mortal, and you have a limited time to live.", author: "Ancient Roman Wisdom" },
            { text: "Life is short, art is long, opportunity is fleeting.", author: "Hippocrates" },
            { text: "Time is the most valuable thing we have, because it is the most irreversible.", author: "John C. Maxwell" },
            { text: "Death is not the opposite of life, but a part of it.", author: "Haruki Murakami" },
            { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi" },
            { text: "The fear of death follows from the fear of life.", author: "Mark Twain" },
            { text: "Time flies over us, but leaves its shadow behind.", author: "Nathaniel Hawthorne" },
            { text: "Yesterday is history, tomorrow is a mystery, today is a gift.", author: "Eleanor Roosevelt" },
            { text: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
            { text: "The unexamined life is not worth living.", author: "Socrates" }
        ];

        this.lifeExpectancy = {
            'North America': 79,
            'Europe': 78,
            'Asia': 73,
            'South America': 76,
            'Africa': 64,
            'Oceania': 81,
            'Antarctica': 79
        };

        this.init();
    }

    async init() {
        await this.loadUserData();
        this.setupEventListeners();
        this.updateDisplay();
        this.updateCandle();
        this.displayDailyQuote(); // Changed from displayRandomQuote to displayDailyQuote
        this.loadGoals();

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes) => {
            this.handleStorageChange(changes);
        });
    }

    async handleStorageChange(changes) {
        // Reload on ANY relevant data change
        if (changes.userAge || changes.userContinent || changes.birthdate || changes.dailyStats) {
            console.log('📡 Storage changed, reloading data:', Object.keys(changes));
            await this.loadUserData();
            this.updateDisplay();
            this.updateCandle();
        }
    }

    async loadUserData() {
        const result = await chrome.storage.local.get(['birthdate', 'userAge', 'userContinent', 'goals', 'dailyStats', 'lastUpdateDate']);

        // ALWAYS recalculate age from birthdate for accuracy
        if (result.birthdate) {
            this.userAge = this.calculateAge(result.birthdate);
            this.birthdate = result.birthdate;
        } else {
            this.userAge = result.userAge || 0;
            this.birthdate = '';
        }

        this.userContinent = result.userContinent || 'North America';
        this.goals = result.goals || [];

        // Get TODAY'S data from daily stats
        const today = new Date().toDateString();
        this.dailyStats = result.dailyStats || {};

        // Check if we've crossed into a new day since last update
        const lastUpdateDate = result.lastUpdateDate;
        if (lastUpdateDate !== today) {
            console.log(`🔄 Day changed from ${lastUpdateDate} to ${today} - forcing recalculation`);
            // Save current date as last update
            await chrome.storage.local.set({ lastUpdateDate: today });
        }

        // Screen time and saved time from today's stats (in seconds)
        const todaysStats = this.dailyStats[today] || { totalTime: 0, savedTime: 0 };
        this.totalScreenTime = Math.floor(todaysStats.totalTime / 60); // Convert to minutes
        this.savedTime = Math.floor(todaysStats.savedTime / 60); // Convert to minutes

        console.log(`📊 TODAY (${today}): Age: ${this.userAge}, Screen Time: ${this.totalScreenTime}m, Saved Time: ${this.savedTime}m`);
    }

    calculateAge(birthdate) {
        // Use shared helper function
        return Helpers.calculateAge(birthdate);
    }

    setupEventListeners() {
        document.getElementById('personalizeBtn').addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });

        document.getElementById('viewStatsBtn').addEventListener('click', () => {
            const statsUrl = chrome.runtime.getURL('stats.html');
            chrome.tabs.create({ url: statsUrl });
        });

        document.getElementById('focusModeBtn').addEventListener('click', () => {
            const focusUrl = chrome.runtime.getURL('focus.html');
            chrome.tabs.create({ url: focusUrl });
        });

        document.getElementById('addGoalBtn').addEventListener('click', () => {
            this.showAddGoalForm();
        });

        // Add goal form event listeners
        document.getElementById('hasDeadline').addEventListener('change', (e) => {
            const deadlineInput = document.getElementById('deadlineInput');
            deadlineInput.style.display = e.target.checked ? 'block' : 'none';
        });

        document.getElementById('saveGoalBtn').addEventListener('click', () => {
            this.saveGoalFromForm();
        });

        document.getElementById('cancelGoalBtn').addEventListener('click', () => {
            this.hideAddGoalForm();
        });

        // Enter key support for goal input
        document.getElementById('goalInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveGoalFromForm();
            }
        });
    }

    updateDisplay() {
        const daysLeft = this.calculateDaysLeft();
        document.getElementById('daysLeft').textContent = daysLeft > 0 ? daysLeft.toLocaleString() : '∞';
        document.getElementById('screenTime').textContent = this.formatTime(this.totalScreenTime);
        document.getElementById('savedTime').textContent = this.formatTime(this.savedTime);
    }

    calculateDaysLeft() {
        if (this.userAge === 0) return 0;

        // Use shared helper with birthdate for precision
        return Helpers.calculateDaysLeft(this.userAge, this.userContinent, this.birthdate);
    }

    updateCandle() {
        const candleBody = document.getElementById('candleBody');
        const waxBase = document.getElementById('waxBase');
        const container = document.querySelector('.container');

        if (this.userAge === 0) {
            // Default full candle
            candleBody.style.height = '150px';
            waxBase.style.height = '8px';
            waxBase.style.width = '60px';
            container.classList.remove('borrowed-time');
            return;
        }

        const expectedLifespan = this.lifeExpectancy[this.userContinent] || 79;

        // Handle dramatic "borrowed time" case
        if (this.userAge >= expectedLifespan) {
            candleBody.style.height = '0px';
            waxBase.style.height = '30px';
            waxBase.style.width = '100px';

            // Add dramatic effects
            container.classList.add('borrowed-time');
            document.getElementById('daysLeft').innerHTML = 'Borrowed time 🕰️... Every second is a gift.';
            document.getElementById('daysLeft').style.animation = 'glow 2s ease-in-out infinite alternate';

            return;
        }

        // Normal candle calculation
        container.classList.remove('borrowed-time');
        const lifePercentage = Math.min(this.userAge / expectedLifespan, 1);

        // Candle shortens as life progresses
        const maxHeight = 150;
        const minHeight = 20;
        const currentHeight = Math.max(minHeight, maxHeight - (lifePercentage * (maxHeight - minHeight)));

        candleBody.style.height = `${currentHeight}px`;

        // Wax accumulates as candle burns
        const maxWaxHeight = 20;
        const maxWaxWidth = 80;
        const waxHeight = 8 + (lifePercentage * (maxWaxHeight - 8));
        const waxWidth = 60 + (lifePercentage * (maxWaxWidth - 60));

        waxBase.style.height = `${waxHeight}px`;
        waxBase.style.width = `${waxWidth}px`;
    }

    displayDailyQuote() {
        // Get or set daily quote - only changes once per day
        const today = new Date().toDateString();
        chrome.storage.local.get(['dailyQuoteDate', 'dailyQuote'], (result) => {
            if (result.dailyQuoteDate === today && result.dailyQuote) {
                // Use stored quote for today
                document.getElementById('dailyQuote').innerHTML = `"${result.dailyQuote.text}"`;
                document.getElementById('quoteAuthor').textContent = `— ${result.dailyQuote.author}`;
            } else {
                // Pick new quote for today
                const randomQuote = this.quotesWithAuthors[Math.floor(Math.random() * this.quotesWithAuthors.length)];
                document.getElementById('dailyQuote').innerHTML = `"${randomQuote.text}"`;
                document.getElementById('quoteAuthor').textContent = `— ${randomQuote.author}`;

                // Store for today
                chrome.storage.local.set({
                    dailyQuoteDate: today,
                    dailyQuote: randomQuote
                });
            }
        });
    }

    displayRandomQuote() {
        const randomQuote = this.quotesWithAuthors[Math.floor(Math.random() * this.quotesWithAuthors.length)];
        document.getElementById('dailyQuote').innerHTML = `"${randomQuote.text}"`;
        document.getElementById('quoteAuthor').textContent = `— ${randomQuote.author}`;
    }

    formatTime(minutes) {
        // Use shared helper function (slight format difference - popup uses "min" instead of "m")
        const formatted = Helpers.formatTime(minutes);
        return formatted.replace(/\b(\d+)m\b/, '$1 min'); // Replace "m" with "min" for popup
    }

    async loadGoals() {
        const goalsList = document.getElementById('goalsList');
        goalsList.innerHTML = '';

        if (this.goals.length === 0) {
            // Just hide the goals section completely when no goals
            goalsList.style.display = 'none';
            return;
        } else {
            goalsList.style.display = 'block';
        }

        this.goals.forEach((goal, index) => {
            const goalItem = document.createElement('div');
            goalItem.className = 'goal-item';
            goalItem.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 5px;';

            // Container for checkbox and label
            const contentContainer = document.createElement('div');
            contentContainer.style.cssText = 'display: flex; align-items: center; flex: 1;';

            // Checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `goal-${index}`;
            checkbox.checked = goal.completed;
            checkbox.style.marginRight = '8px';
            checkbox.addEventListener('change', () => {
                this.toggleGoal(index);
            });

            // Label
            const label = document.createElement('label');
            label.htmlFor = `goal-${index}`;
            label.style.flex = '1';
            label.textContent = goal.text; // Safe assignment

            // Deadline Info
            if (goal.deadline) {
                const deadlineDate = new Date(goal.deadline);
                const now = new Date();
                const daysUntil = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));

                const deadlineSpan = document.createElement('span');
                deadlineSpan.style.fontSize = '12px';

                if (daysUntil < 0) {
                    deadlineSpan.textContent = ' (OVERDUE)';
                    deadlineSpan.style.color = '#ff6b6b';
                } else if (daysUntil === 0) {
                    deadlineSpan.textContent = ' (DUE TODAY)';
                    deadlineSpan.style.color = '#ffd700';
                } else if (daysUntil === 1) {
                    deadlineSpan.textContent = ' (DUE TOMORROW)';
                    deadlineSpan.style.color = '#ff9500';
                } else if (daysUntil <= 7) {
                    deadlineSpan.textContent = ` (${daysUntil} days left)`;
                    deadlineSpan.style.color = '#ff9500';
                } else {
                    deadlineSpan.textContent = ` (${daysUntil} days left)`;
                    deadlineSpan.style.color = '#888';
                }

                // Add a space before the span
                label.appendChild(document.createTextNode(' '));
                label.appendChild(deadlineSpan);
            }

            contentContainer.appendChild(checkbox);
            contentContainer.appendChild(label);

            // Delete Button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-goal-btn';
            deleteBtn.dataset.index = index;
            deleteBtn.textContent = '×';
            deleteBtn.style.cssText = 'background: #ff4444; color: white; border: none; border-radius: 3px; padding: 4px 8px; font-size: 12px; cursor: pointer; margin-left: 8px;';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteGoal(index);
            });

            goalItem.appendChild(contentContainer);
            goalItem.appendChild(deleteBtn);
            goalsList.appendChild(goalItem);
        });
    }

    async deleteGoal(index) {
        if (confirm('Are you sure you want to delete this goal?')) {
            this.goals.splice(index, 1);
            await chrome.storage.local.set({ goals: this.goals });

            // Update deadline reminders
            try {
                chrome.runtime.sendMessage({ action: 'updateGoalDeadlines' }, () => { if (chrome.runtime.lastError) { } });
            } catch (error) {
                // Ignore connection errors
            }

            this.loadGoals();
        }
    }

    showAddGoalForm() {
        const form = document.getElementById('addGoalForm');
        const input = document.getElementById('goalInput');
        const addBtn = document.getElementById('addGoalBtn');

        form.style.display = 'block';
        addBtn.style.display = 'none';
        input.focus();
    }

    hideAddGoalForm() {
        const form = document.getElementById('addGoalForm');
        const input = document.getElementById('goalInput');
        const deadlineInput = document.getElementById('deadlineInput');
        const hasDeadlineCheckbox = document.getElementById('hasDeadline');
        const addBtn = document.getElementById('addGoalBtn');

        form.style.display = 'none';
        addBtn.style.display = 'block';

        // Clear form
        input.value = '';
        deadlineInput.value = '';
        hasDeadlineCheckbox.checked = false;
        deadlineInput.style.display = 'none';
    }

    async saveGoalFromForm() {
        const goalInput = document.getElementById('goalInput');
        const deadlineInput = document.getElementById('deadlineInput');
        const hasDeadlineCheckbox = document.getElementById('hasDeadline');

        const goalText = goalInput.value.trim();

        if (!goalText) {
            goalInput.style.border = '2px solid #ff4444';
            setTimeout(() => {
                goalInput.style.border = '1px solid #ccc';
            }, 2000);
            return;
        }

        let deadline = null;
        if (hasDeadlineCheckbox.checked && deadlineInput.value) {
            const deadlineDate = new Date(deadlineInput.value);
            if (!isNaN(deadlineDate.getTime()) && deadlineDate > new Date()) {
                deadline = deadlineInput.value;
            }
        }

        this.goals.push({
            text: goalText,
            completed: false,
            createdAt: new Date().toISOString(),
            deadline: deadline
        });

        await chrome.storage.local.set({ goals: this.goals });

        // Update deadline reminders if deadline was set
        if (deadline) {
            try {
                chrome.runtime.sendMessage({ action: 'updateGoalDeadlines' }, () => { if (chrome.runtime.lastError) { } });
            } catch (error) {
                // Ignore connection errors
            }
        }

        this.loadGoals();
        this.hideAddGoalForm();
    }

    async addGoal() {
        const goalText = prompt('Enter your goal:');
        if (goalText && goalText.trim()) {
            const hasDeadline = confirm('Do you want to set a deadline for this goal?');
            let deadline = null;

            if (hasDeadline) {
                const deadlineInput = prompt('Enter deadline (YYYY-MM-DD format):');
                if (deadlineInput) {
                    const deadlineDate = new Date(deadlineInput);
                    if (!isNaN(deadlineDate.getTime()) && deadlineDate > new Date()) {
                        deadline = deadlineInput;
                    } else {
                        alert('Invalid date or date is in the past. Goal created without deadline.');
                    }
                }
            }

            this.goals.push({
                text: goalText.trim(),
                completed: false,
                createdAt: new Date().toISOString(),
                deadline: deadline
            });

            await chrome.storage.local.set({ goals: this.goals });

            // Update deadline reminders if deadline was set
            if (deadline) {
                try {
                    chrome.runtime.sendMessage({ action: 'updateGoalDeadlines' }, () => { if (chrome.runtime.lastError) { } });
                } catch (error) {
                    // Ignore connection errors
                }
            }

            this.loadGoals();
        }
    }

    async toggleGoal(index) {
        if (this.goals[index]) {
            this.goals[index].completed = !this.goals[index].completed;
            await chrome.storage.local.set({ goals: this.goals });
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    mementoMoriInstance = new MementoMori();
});

// Background script communication
let mementoMoriInstance = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateSavedTime') {
        // Update saved time display - convert seconds to minutes  
        const savedTimeMinutes = Math.floor(request.time / 60);
        const savedTimeElement = document.getElementById('savedTime');
        if (savedTimeElement && mementoMoriInstance) {
            savedTimeElement.textContent = mementoMoriInstance.formatTime(savedTimeMinutes);
        }
    } else if (request.action === 'updateScreenTime') {
        // Update screen time display - convert seconds to minutes  
        const screenTimeMinutes = Math.floor(request.totalTime / 60);
        const screenTimeElement = document.getElementById('screenTime');
        if (screenTimeElement && mementoMoriInstance) {
            screenTimeElement.textContent = mementoMoriInstance.formatTime(screenTimeMinutes);
        }
    }
});