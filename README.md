# Memento Mori - Chrome Extension

<div align="center">
  <a href="https://chrome.google.com/webstore/detail/your-extension-id-here">
    <img src="https://storage.googleapis.com/web-dev-uploads/image/WlD8wC6g8khYWPJUsQceQkhXSlv1/iNE4dC3V9z7oM5kF5d0e.png" alt="Available in the Chrome Web Store" width="206" height="58">
  </a>
  <br><br>
  <img src="assets/banner.jpeg" alt="Memento Mori Logo" width="1023" height="439">
  <h3>Your Life Expectancy vs. Screen Time</h3>
  <p>A productivity extension that reminds you of life's brevity while blocking distracting websites.</p>
  <p>
    <a href="https://github.com/AmazingKeymaster">
      <img src="https://img.shields.io/badge/GitHub-AmazingKeymaster-black?style=for-the-badge&logo=github" alt="GitHub">
    </a>
  </p>
</div>

---

## 💀 About

**Memento Mori** is not just another website blocker. It's a philosophy. By visualizing your estimated remaining time on Earth and contrasting it with the time you waste on distracting sites, it provides a powerful motivation to stay focused on what truly matters.

### Key Features

-   **Life Expectancy Countdown**: Visualizes your estimated remaining days based on actuarial data.
-   **Real-time Tracking**: Tracks time spent on distracting websites vs. productive work.
-   **Strict Mode**: Prevents disabling the extension or unblocking sites without a PIN.
-   **Smart Blocking**: Blocks sites during scheduled focus hours.
-   **Daily Reflections**: Notifications to remind you of your mortality and goals.

## 🚀 Installation

### From Chrome Web Store
[Download Memento Mori](https://chrome.google.com/webstore/detail/your-extension-id-here)

### From Source (Developer Mode)

1.  Clone this repository:
    ```bash
    git clone https://github.com/AmazingKeymaster/memento-mori.git
    ```
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the directory where you cloned the repository.

## 🛠️ Development

### Project Structure

-   `manifest.json`: Extension configuration and permissions.
-   `background.js`: Service worker for background tasks (tracking, alarms, notifications).
-   `content.js`: Script injected into web pages for interaction.
-   `popup.html` / `popup.js`: The main extension popup UI.
-   `options.html` / `options.js`: Settings page for configuring birthdate, blocking schedules, etc.
-   `blocked.html`: Page shown when a site is blocked.
-   `utils.js`: Shared utility functions and Logger.

### Debugging

-   **Popup**: Right-click the extension icon -> Inspect Popup.
-   **Background Service**: Go to `chrome://extensions/`, find Memento Mori, and click "service worker".
-   **Content Script**: Open Developer Tools (F12) on any web page.

## 🔒 Privacy

All data (birthdate, stats, settings) is stored locally on your device using `chrome.storage.local`. No data is sent to external servers.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
