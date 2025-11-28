const quotes = [
    { text: "The trouble is, you think you have time.", author: "Buddha" },
    { text: "Time is what we want most, but what we use worst.", author: "William Penn" },
    { text: "Yesterday is history, tomorrow is a mystery, today is a gift.", author: "Eleanor Roosevelt" },
    { text: "Lost time is never found again.", author: "Benjamin Franklin" },
    { text: "Time flies over us, but leaves its shadow behind.", author: "Nathaniel Hawthorne" },
    { text: "The two most powerful warriors are patience and time.", author: "Leo Tolstoy" },
    { text: "Time is the wisest counselor of all.", author: "Pericles" },
    { text: "Time is the most valuable thing we can spend.", author: "Theophrastus" },
    { text: "Better three hours too soon than a minute too late.", author: "William Shakespeare" },
    { text: "Time is what prevents everything from happening at once.", author: "Albert Einstein" }
];

function displayRandomQuote() {
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    document.getElementById('inspirationalQuote').textContent = randomQuote.text;
    document.getElementById('quoteAuthor').textContent = `- ${randomQuote.author}`;
}

function getBlockedSite() {
    const urlParams = new URLSearchParams(window.location.search);
    const site = urlParams.get('site');
    const blockedSiteElement = document.getElementById('blockedSite');
    const blockedSiteContainer = document.querySelector('.blocked-site');

    if (site && site !== 'null' && site !== 'undefined' && site.trim() !== '') {
        // Show the actual blocked site
        let displaySite = decodeURIComponent(site);
        // Remove www. and http/https for cleaner look
        try {
            const url = new URL(displaySite.startsWith('http') ? displaySite : `https://${displaySite}`);
            displaySite = url.hostname.replace(/^www\./, '');
        } catch (e) {
            // If invalid URL, just use the string as is but try to remove www.
            displaySite = displaySite.replace(/^www\./, '');
        }

        blockedSiteElement.textContent = displaySite;
        blockedSiteContainer.style.display = 'block';
    } else {
        // Try to extract hostname from referrer as fallback
        let hostname = null;

        if (document.referrer) {
            try {
                hostname = new URL(document.referrer).hostname;
                if (hostname && !hostname.includes('chrome-extension://')) {
                    blockedSiteElement.textContent = hostname.replace(/^www\./, '');
                    blockedSiteContainer.style.display = 'block';
                    return;
                }
            } catch (e) {
                // Ignore referrer parsing errors
            }
        }

        // If we can't determine the site, hide the entire section
        blockedSiteContainer.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    displayRandomQuote();
    getBlockedSite();

    document.getElementById('focusBtn').addEventListener('click', () => {
        // Navigate to focus page instead of showing alert
        const focusUrl = chrome.runtime.getURL('focus.html');
        window.location.href = focusUrl;
    });

    document.getElementById('backBtn').addEventListener('click', () => {
        // Redirect to the default new tab page
        chrome.tabs.update({ url: 'chrome://newtab' });
    });
});
