class FocusMode {
    constructor() {
        this.timeLeft = 25 * 60; // 25 minutes in seconds
        this.timerInterval = null;
        this.isRunning = false;
        this.currentTask = '';

        this.init();
    }

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.updateTimerDisplay();
        this.loadState();
    }

    cacheDOM() {
        this.timerDisplay = document.getElementById('timer');
        this.startBtn = document.getElementById('startBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.taskInput = document.getElementById('taskInput');
        this.setTaskBtn = document.getElementById('setTaskBtn');
        this.taskDisplay = document.getElementById('taskDisplay');
        this.currentTaskText = document.getElementById('currentTaskText');
        this.clearTaskBtn = document.getElementById('clearTaskBtn');
        this.backBtn = document.getElementById('backBtn');
        this.menuBtn = document.getElementById('menuBtn');
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.startTimer());
        this.pauseBtn.addEventListener('click', () => this.pauseTimer());
        this.resetBtn.addEventListener('click', () => this.resetTimer());

        this.setTaskBtn.addEventListener('click', () => this.setTask());
        this.taskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.setTask();
        });

        this.clearTaskBtn.addEventListener('click', () => this.clearTask());

        this.backBtn.addEventListener('click', () => {
            chrome.tabs.update({ url: 'chrome://newtab' });
        });

        this.menuBtn.addEventListener('click', () => {
            window.close();
        });
    }

    loadState() {
        const savedTask = localStorage.getItem('focusTask');
        if (savedTask) {
            this.currentTask = savedTask;
            this.showTaskDisplay();
        }
    }

    startTimer() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.startBtn.style.display = 'none';
        this.pauseBtn.style.display = 'inline-block';

        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            this.updateTimerDisplay();

            if (this.timeLeft <= 0) {
                this.timerFinished();
            }
        }, 1000);
    }

    pauseTimer() {
        if (!this.isRunning) return;

        this.isRunning = false;
        clearInterval(this.timerInterval);
        this.startBtn.style.display = 'inline-block';
        this.pauseBtn.style.display = 'none';
    }

    resetTimer() {
        this.pauseTimer();
        this.timeLeft = 25 * 60;
        this.updateTimerDisplay();
    }

    timerFinished() {
        this.pauseTimer();
        this.timeLeft = 0;
        this.updateTimerDisplay();

        // Play notification sound if available or show notification
        try {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'assets/icon-128.png',
                title: 'Focus Session Complete',
                message: 'Great job! Take a break.'
            });
        } catch (e) {
            console.error('Notification failed', e);
        }

        alert('Focus session complete! Take a break.');
    }

    updateTimerDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // Update document title
        document.title = `${minutes}:${seconds.toString().padStart(2, '0')} - Focus Mode`;
    }

    setTask() {
        const task = this.taskInput.value.trim();
        if (task) {
            this.currentTask = task;
            localStorage.setItem('focusTask', task);
            this.showTaskDisplay();
            this.taskInput.value = '';
        }
    }

    clearTask() {
        this.currentTask = '';
        localStorage.removeItem('focusTask');
        this.showTaskInput();
    }

    showTaskDisplay() {
        this.taskInput.parentElement.style.display = 'none';
        this.taskDisplay.style.display = 'block';
        this.currentTaskText.textContent = this.currentTask;
    }

    showTaskInput() {
        this.taskInput.parentElement.style.display = 'flex';
        this.taskDisplay.style.display = 'none';
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    new FocusMode();
});
