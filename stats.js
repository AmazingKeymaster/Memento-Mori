/* global chrome */

class StatsManager {
    constructor() {
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
        await this.loadData();
        this.updateStats();
        this.createWeeklyChart();
        this.createTopSitesChart();
        this.loadGoalsList();

        // Bind time range selector
        const timeRangeSelector = document.getElementById('timeRangeSelector');
        if (timeRangeSelector) {
            timeRangeSelector.addEventListener('change', (e) => {
                this.createTopSitesChart(e.target.value);
            });
        }

        this.cleanupOldGoals(); // Clean up completed goals from previous days

        // Refresh stats every minute for real-time updates
        setInterval(() => {
            this.refreshStats();
        }, 60000);
    }

    async refreshStats() {
        await this.loadData();
        this.updateStats();
        this.createWeeklyChart();
        this.createTopSitesChart();
    }

    async loadData() {
        const result = await chrome.storage.local.get([
            'birthdate', 'userAge', 'userContinent', 'goals', 'savedTime',
            'dailyStats', 'weeklyStats', 'blockedSites', 'dailyTimeSpent'
        ]);

        // Calculate age from birthdate if available
        if (result.birthdate) {
            this.userAge = this.calculateAge(result.birthdate);
        } else {
            this.userAge = result.userAge || 0;
        }

        this.userContinent = result.userContinent || 'North America';
        this.goals = result.goals || [];

        // Get saved time from daily stats (instead of wasted time)
        const today = new Date().toDateString();
        this.dailyStats = result.dailyStats || {};
        const todaysStats = this.dailyStats[today] || { savedTime: 0 };
        this.savedTime = Math.floor(todaysStats.savedTime / 60); // Convert seconds to minutes

        this.weeklyStats = result.weeklyStats || {};
        this.blockedSites = result.blockedSites || [];
        this.birthdate = result.birthdate || '';
        this.dailyTimeSpent = result.dailyTimeSpent || {};
    }

    async cleanupOldGoals() {
        const today = new Date().toDateString();
        let goalsChanged = false;

        // Remove completed goals from previous days
        this.goals = this.goals.filter(goal => {
            if (goal.completed && goal.createdAt) {
                const goalDate = new Date(goal.createdAt).toDateString();
                if (goalDate !== today) {
                    goalsChanged = true;
                    return false; // Remove this goal
                }
            }
            return true; // Keep this goal
        });

        if (goalsChanged) {
            await chrome.storage.local.set({ goals: this.goals });
        }
    }

    calculateAge(birthdate) {
        // Use shared helper function
        return Helpers.calculateAge(birthdate);
    }

    updateStats() {
        // Days Remaining
        const daysLeft = this.calculateDaysLeft();
        if (daysLeft < 0) {
            document.getElementById('daysRemaining').textContent = 'Borrowed Time';
            document.getElementById('daysRemaining').style.color = '#ff4444';
            document.getElementById('daysRemaining').style.animation = 'glow 2s ease-in-out infinite alternate';
        } else {
            document.getElementById('daysRemaining').textContent =
                daysLeft > 0 ? daysLeft.toLocaleString() : '∞';
        }

        // Time Saved (time when blocking schedules were active)
        document.getElementById('timeSaved').textContent = this.formatTime(this.savedTime);

        // Goals Completed
        const completedGoals = this.goals.filter(goal => goal.completed).length;
        document.getElementById('goalsCompleted').textContent = `${completedGoals}/${this.goals.length}`;

        // Productivity Score (based on real data)
        const productivityScore = this.calculateProductivityScore();
        document.getElementById('productivityScore').textContent = `${productivityScore}%`;

        // REAL SCREEN TIME DISPLAY
        const todayScreenTime = this.getTodayScreenTime();
        const screenTimeElement = document.getElementById('screenTimeToday');
        if (screenTimeElement) {
            screenTimeElement.textContent = this.formatTime(todayScreenTime);
        }
    }

    getTodayScreenTime() {
        const today = new Date().toDateString();
        let totalMinutes = 0;

        // Get real screen time from dailyStats (stored in SECONDS, convert to minutes)
        if (this.dailyStats[today] && this.dailyStats[today].totalTime) {
            totalMinutes += Math.floor(this.dailyStats[today].totalTime / 60); // Convert seconds to minutes
        }

        // Get time from dailyTimeSpent (legacy support - already in minutes)
        if (this.dailyTimeSpent[today]) {
            if (typeof this.dailyTimeSpent[today] === 'number') {
                totalMinutes += this.dailyTimeSpent[today];
            } else if (typeof this.dailyTimeSpent[today] === 'object') {
                Object.values(this.dailyTimeSpent[today]).forEach(time => {
                    totalMinutes += time || 0;
                });
            }
        }

        return totalMinutes;
    }

    calculateDaysLeft() {
        if (this.userAge === 0) return 0;

        const expectedLifespan = this.lifeExpectancy[this.userContinent] || 79;

        if (this.userAge >= expectedLifespan) {
            return -1; // Borrowed time
        }

        const yearsLeft = Math.max(0, expectedLifespan - this.userAge);
        return Math.floor(yearsLeft * 365.25);
    }

    calculateProductivityScore() {
        const totalGoals = this.goals.length;
        const todayScreenTime = this.getTodayScreenTime();

        // If no data at all, return 0 (not 100)
        if (totalGoals === 0 && this.savedTime === 0 && todayScreenTime === 0) return 0;

        // Start with a base score of 50 (neutral)
        let timeScore = 50;

        // Add points for saved time (blocking schedules being active)
        // savedTime is in minutes, convert to hours for calculation
        const savedHours = this.savedTime / 60;
        if (savedHours > 0) {
            // Bonus: up to 30 points for saved time (1 point per hour, max 30)
            timeScore += Math.min(30, savedHours * 1);
        }

        // Deduct points for excessive screen time (convert to hours)
        const screenTimeHours = todayScreenTime / 60; // todayScreenTime is in minutes
        if (screenTimeHours > 2) { // More than 2 hours
            // Deduct: 5 points per hour over 2 hours, max 40 points deduction
            timeScore -= Math.min(40, (screenTimeHours - 2) * 5);
        } else if (screenTimeHours <= 1) {
            // Bonus: if screen time is low (under 1 hour), add bonus points
            timeScore += Math.min(20, (1 - screenTimeHours) * 20);
        }

        // Calculate goal score separately
        let goalScore = 0;
        if (totalGoals > 0) {
            const completedGoals = this.goals.filter(goal => goal.completed).length;
            goalScore = (completedGoals / totalGoals) * 50; // Max 50 points from goals
        }

        // Combine: 60% from time management, 40% from goals
        const finalScore = (timeScore * 0.6) + (goalScore * 0.4);

        return Math.max(0, Math.min(100, Math.round(finalScore)));
    }

    formatTime(minutes) {
        // Use shared helper function
        return Helpers.formatTime(minutes);
    }

    createWeeklyChart() {
        const chartContainer = document.getElementById('weeklyChart');
        chartContainer.innerHTML = '';

        const weekData = this.generateWeeklyData();
        const maxValue = Math.max(...weekData.map(d => d.value)) || 1;

        weekData.forEach(day => {
            const barContainer = document.createElement('div');
            barContainer.style.display = 'flex';
            barContainer.style.flexDirection = 'column';
            barContainer.style.alignItems = 'center';

            const bar = document.createElement('div');
            bar.className = 'chart-bar';
            const height = (day.value / maxValue) * 200; // Max height 200px
            bar.style.height = `${height}px`;

            const value = document.createElement('div');
            value.className = 'chart-value';
            value.textContent = `${day.value}m`; // Show minutes

            const label = document.createElement('div');
            label.className = 'chart-label';
            label.textContent = day.day;

            bar.appendChild(value);
            barContainer.appendChild(bar);
            barContainer.appendChild(label);
            chartContainer.appendChild(barContainer);
        });

        // Add chart units explanation with better description
        const unitsLabel = document.createElement('div');
        unitsLabel.style.textAlign = 'center';
        unitsLabel.style.marginTop = '15px';
        unitsLabel.style.color = '#94a3b8';
        unitsLabel.style.fontSize = '14px';
        unitsLabel.innerHTML = '<strong>📊 Real-Time Daily Screen Time (minutes)</strong><br>Actual time spent actively browsing websites tracked by Memento Mori';
        chartContainer.appendChild(unitsLabel);
    }

    generateWeeklyData() {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const weekData = [];

        // Get REAL time data from dailyStats and dailyTimeSpent
        const today = new Date();

        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateString = date.toDateString();

            // Calculate REAL screen time from multiple sources
            let timeSpent = 0;

            // Primary source: dailyStats with site-specific times (stored in SECONDS, convert to minutes)
            if (this.dailyStats[dateString] && this.dailyStats[dateString].totalTime) {
                timeSpent += Math.floor(this.dailyStats[dateString].totalTime / 60); // Convert seconds to minutes
            }

            // Secondary source: dailyTimeSpent (already in minutes)
            if (this.dailyTimeSpent[dateString]) {
                if (typeof this.dailyTimeSpent[dateString] === 'number') {
                    timeSpent += this.dailyTimeSpent[dateString];
                } else if (typeof this.dailyTimeSpent[dateString] === 'object') {
                    Object.values(this.dailyTimeSpent[dateString]).forEach(time => {
                        timeSpent += time || 0;
                    });
                }
            }

            // Ensure we have realistic data
            if (timeSpent === 0 && i > 0) {
                // For past days with no data, we might have some blocked attempts
                if (this.dailyStats[dateString] && this.dailyStats[dateString].blocked) {
                    timeSpent = this.dailyStats[dateString].blocked; // Minimal time from blocked attempts
                }
            }

            weekData.push({
                day: days[date.getDay() === 0 ? 6 : date.getDay() - 1], // Adjust Sunday
                value: Math.max(0, timeSpent), // Ensure non-negative
                date: dateString
            });
        }

        return weekData;
    }

    createTopSitesChart(timeRange = 'today') {
        const container = document.getElementById('topSitesChart');
        container.innerHTML = '';

        const siteTimes = {};
        const today = new Date();

        // Filter dates based on timeRange
        const relevantDates = [];
        if (timeRange === 'today') {
            relevantDates.push(today.toDateString());
        } else if (timeRange === 'week') {
            for (let i = 0; i < 7; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                relevantDates.push(d.toDateString());
            }
        } else if (timeRange === 'month') {
            for (let i = 0; i < 30; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                relevantDates.push(d.toDateString());
            }
        }

        // Iterate through daily stats and filter by date
        for (const [date, stats] of Object.entries(this.dailyStats)) {
            // Check if this date is within our range
            // We compare strings directly as they are toDateString() format
            if (relevantDates.includes(date) && stats.sites) {
                for (const [site, seconds] of Object.entries(stats.sites)) {
                    if (!siteTimes[site]) siteTimes[site] = 0;
                    siteTimes[site] += seconds;
                }
            }
        }

        // Convert to array and sort
        const sortedSites = Object.entries(siteTimes)
            .map(([site, seconds]) => ({ site, minutes: Math.floor(seconds / 60) }))
            .sort((a, b) => b.minutes - a.minutes)
            .slice(0, 10); // Top 10

        if (sortedSites.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 20px;">No browsing data for this period</div>';
            return;
        }

        const maxMinutes = sortedSites[0].minutes || 1;

        sortedSites.forEach(item => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.marginBottom = '15px';

            const label = document.createElement('div');
            label.style.width = '120px';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            label.style.whiteSpace = 'nowrap';
            label.style.marginRight = '10px';
            label.style.color = '#e2e8f0';
            label.textContent = item.site.replace(/^www\./, '');
            label.title = item.site;

            const barContainer = document.createElement('div');
            barContainer.style.flex = '1';
            barContainer.style.background = 'rgba(255, 255, 255, 0.1)';
            barContainer.style.borderRadius = '4px';
            barContainer.style.height = '20px';
            barContainer.style.overflow = 'hidden';

            const bar = document.createElement('div');
            const width = Math.max(5, (item.minutes / maxMinutes) * 100);
            bar.style.width = `${width}%`;
            bar.style.height = '100%';
            bar.style.background = 'linear-gradient(90deg, #ffd700, #ff6b6b)';
            bar.style.borderRadius = '4px';

            const value = document.createElement('div');
            value.style.width = '60px';
            value.style.textAlign = 'right';
            value.style.marginLeft = '10px';
            value.style.color = '#ffd700';
            value.style.fontWeight = 'bold';
            value.textContent = this.formatTime(item.minutes);

            barContainer.appendChild(bar);
            row.appendChild(label);
            row.appendChild(barContainer);
            row.appendChild(value);

            container.appendChild(row);
        });
    }

    loadGoalsList() {
        const goalsList = document.getElementById('goalsList');
        goalsList.innerHTML = '';

        if (this.goals.length === 0) {
            goalsList.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #64748b;">
                    <p>No goals set yet. Go to settings to add your first goal!</p>
                </div>
            `;
            return;
        }

        // Show recent goals (last 10)
        const recentGoals = this.goals.slice(-10);
        recentGoals.forEach(goal => {
            const goalItem = document.createElement('div');
            goalItem.className = 'goal-item';
            goalItem.innerHTML = `
                <div class="goal-text">${goal.text}</div>
                <div class="goal-status ${goal.completed ? 'goal-completed' : 'goal-pending'}">
                    ${goal.completed ? 'Completed' : 'Pending'}
                </div>
            `;
            goalsList.appendChild(goalItem);
        });
    }
}

// Add glow animation for borrowed time
const style = document.createElement('style');
style.textContent = `
    @keyframes glow {
        0% { 
            color: #ffd700;
            text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
        }
        100% { 
            color: #ff4444;
            text-shadow: 0 0 20px rgba(255, 68, 68, 0.8), 0 0 30px rgba(255, 68, 68, 0.6);
        }
    }
`;
document.head.appendChild(style);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new StatsManager();
});