async updateScreenTimeEverySecond() {
        // SIMPLIFIED SCREEN TIME TRACKING - Always track active tab if available
        if (this.activeTabId) {
            try {
                const tab = await chrome.tabs.get(this.activeTabId);
                if (tab.url && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith('chrome://')) {
                    const hostname = new URL(tab.url).hostname.toLowerCase();
                    
                    // Add 1 second to screen time
                    await this.recordScreenTime(hostname, 1);
                    
                    console.log(`📊 Screen time +1s: ${hostname}`);
                }
            } catch (error) {
                console.log('Error updating screen time:', error);
            }
        }
    }