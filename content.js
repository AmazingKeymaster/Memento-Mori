class ContentScriptManager {
    constructor() {
        this.youtubeSettings = {};
        
        // Smart idle detection state
        this.lastMouseMovement = Date.now();
        this.lastKeyPress = Date.now();
        this.lastScrollEvent = Date.now();
        this.videoIsPlaying = false;
        this.audioIsPlaying = false;
        this.noMouseMovement = false;
        this.noKeyPress = false;
        this.scrollingIsDetected = false;
        this.tabIsInFocus = true;
        this.idleThreshold = 30 * 1000; // 30 seconds
        
        this.init();
    }

    async init() {
        // Load YouTube settings
        await this.loadYouTubeSettings();
        
        // Apply YouTube modifications if on YouTube
        if (this.isYouTube()) {
            this.applyYouTubeModifications();
            
            // Watch for dynamic content changes
            this.observeYouTubeChanges();
        }

        // Initialize smart idle detection
        this.setupIdleDetection();

        // Listen for setting updates
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'updateYouTubeSettings') {
                this.youtubeSettings = request.settings;
                this.applyYouTubeModifications();
            }
        });
    }

    async loadYouTubeSettings() {
        try {
            const result = await chrome.storage.local.get(['youtubeSettings']);
            this.youtubeSettings = result.youtubeSettings || {};
        } catch (error) {
            console.error('Failed to load YouTube settings:', error);
        }
    }

    isYouTube() {
        return window.location.hostname === 'www.youtube.com' || window.location.hostname === 'youtube.com';
    }

    applyYouTubeModifications() {
        if (!this.isYouTube()) return;

        this.removeExistingStyles();
        
        const styles = [];

        // Hide Home Page
        if (this.youtubeSettings.hideHome) {
            styles.push(`
                ytd-rich-grid-renderer,
                ytd-two-column-browse-results-renderer,
                #contents.ytd-rich-grid-renderer { display: none !important; }
            `);
        }

        // Hide Shorts
        if (this.youtubeSettings.hideShorts) {
            styles.push(`
                ytd-rich-shelf-renderer[is-shorts],
                ytd-reel-shelf-renderer,
                [is-shorts], 
                ytd-shorts,
                #shorts-container,
                ytd-grid-video-renderer[is-shorts] { display: none !important; }
            `);
        }

        // Hide Comments
        if (this.youtubeSettings.hideComments) {
            styles.push(`
                #comments,
                ytd-comments#comments,
                #comments-section { display: none !important; }
            `);
        }

        // Hide Recommended Videos
        if (this.youtubeSettings.hideRecommended) {
            styles.push(`
                #secondary,
                #related,
                ytd-watch-next-secondary-results-renderer,
                #secondary-inner { display: none !important; }
            `);
        }

        // Hide Subscriptions
        if (this.youtubeSettings.hideSubscriptions) {
            styles.push(`
                #guide-links-primary a[href="/feed/subscriptions"],
                ytd-guide-entry-renderer:has([href="/feed/subscriptions"]) { display: none !important; }
            `);
        }

        // Hide Explore
        if (this.youtubeSettings.hideExplore) {
            styles.push(`
                #guide-links-primary a[href="/feed/explore"],
                ytd-guide-entry-renderer:has([href="/feed/explore"]) { display: none !important; }
            `);
        }

        // Hide Trends
        if (this.youtubeSettings.hideTrends) {
            styles.push(`
                #guide-links-primary a[href="/feed/trending"],
                ytd-guide-entry-renderer:has([href="/feed/trending"]) { display: none !important; }
            `);
        }

        // Hide Top Bar
        if (this.youtubeSettings.hideTopBar) {
            styles.push(`
                #masthead,
                ytd-masthead,
                #searchbox { display: none !important; }
                #page-manager { margin-top: 0 !important; }
            `);
        }

        // Disable End Cards
        if (this.youtubeSettings.disableEndCards) {
            styles.push(`
                .ytp-ce-element,
                .ytp-cards-teaser,
                .ytp-endscreen-element { display: none !important; }
            `);
        }

        // Black & White Mode
        if (this.youtubeSettings.blackAndWhite) {
            styles.push(`
                html { filter: grayscale(100%) !important; }
            `);
        }

        // Apply all styles
        if (styles.length > 0) {
            this.injectStyles(styles.join('\n'));
        }

        // Handle autoplay
        if (this.youtubeSettings.disableAutoplay) {
            this.disableAutoplay();
        }
    }

    removeExistingStyles() {
        const existingStyle = document.getElementById('memento-mori-youtube-styles');
        if (existingStyle) {
            existingStyle.remove();
        }
    }

    injectStyles(css) {
        const style = document.createElement('style');
        style.id = 'memento-mori-youtube-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    disableAutoplay() {
        // Disable autoplay by removing the autoplay attribute
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            video.autoplay = false;
            video.removeAttribute('autoplay');
        });

        // Wait for document.body to be available before watching for new videos
        const startWatching = () => {
            if (!document.body) {
                setTimeout(startWatching, 100);
                return;
            }
            
            // Watch for new videos
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const videos = node.querySelectorAll ? node.querySelectorAll('video') : [];
                            videos.forEach(video => {
                                video.autoplay = false;
                                video.removeAttribute('autoplay');
                            });
                        }
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        };
        
        startWatching();

        // Also try to click the autoplay toggle if it exists
        setTimeout(() => {
            const autoplayToggle = document.querySelector('.ytp-autonav-toggle-button[aria-pressed="true"]');
            if (autoplayToggle) {
                autoplayToggle.click();
            }
        }, 2000);
    }

    observeYouTubeChanges() {
        // YouTube is a SPA, so we need to watch for navigation changes
        let lastUrl = location.href;
        
        // Wait for DOM to be ready before observing
        const startObserving = () => {
            if (!document.body) {
                setTimeout(startObserving, 100);
                return;
            }
            
            const observer = new MutationObserver(() => {
                const currentUrl = location.href;
                if (currentUrl !== lastUrl) {
                    lastUrl = currentUrl;
                    // Reapply modifications after navigation
                    setTimeout(() => {
                        this.applyYouTubeModifications();
                    }, 1000);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        };
        
        startObserving();

        // Also listen for popstate events
        window.addEventListener('popstate', () => {
            setTimeout(() => {
                this.applyYouTubeModifications();
            }, 1000);
        });
    }

    setupIdleDetection() {
        console.log('🔍 Setting up smart idle detection...');
        
        // Track mouse movement
        document.addEventListener('mousemove', () => {
            this.lastMouseMovement = Date.now();
            this.noMouseMovement = false;
        }, { passive: true });

        // Track key presses
        document.addEventListener('keydown', () => {
            this.lastKeyPress = Date.now();
            this.noKeyPress = false;
        }, { passive: true });

        // Track scrolling
        document.addEventListener('scroll', () => {
            this.lastScrollEvent = Date.now();
            this.scrollingIsDetected = true;
            // Reset scrolling flag after 2 seconds
            setTimeout(() => {
                this.scrollingIsDetected = false;
            }, 2000);
        }, { passive: true });

        // Track tab focus
        document.addEventListener('visibilitychange', () => {
            this.tabIsInFocus = !document.hidden;
        });

        window.addEventListener('focus', () => {
            this.tabIsInFocus = true;
        });

        window.addEventListener('blur', () => {
            this.tabIsInFocus = false;
        });

        // Track video playback
        this.trackVideoPlayback();
        
        // Track audio playback
        this.trackAudioPlayback();

        // Start idle checking loop
        this.startIdleCheckLoop();
    }

    trackVideoPlayback() {
        // Monitor all video elements
        const checkVideos = () => {
            const videos = document.querySelectorAll('video');
            let anyVideoPlaying = false;
            
            videos.forEach(video => {
                if (!video.paused && !video.ended && video.readyState > 2) {
                    anyVideoPlaying = true;
                }
            });
            
            this.videoIsPlaying = anyVideoPlaying;
        };

        // Check videos every 500ms
        setInterval(checkVideos, 500);

        // Also listen for video events
        document.addEventListener('play', (e) => {
            if (e.target.tagName === 'VIDEO') {
                this.videoIsPlaying = true;
            }
        }, true);

        document.addEventListener('pause', (e) => {
            if (e.target.tagName === 'VIDEO') {
                // Recheck all videos after pause event
                setTimeout(() => {
                    const videos = document.querySelectorAll('video');
                    let anyVideoPlaying = false;
                    videos.forEach(video => {
                        if (!video.paused && !video.ended && video.readyState > 2) {
                            anyVideoPlaying = true;
                        }
                    });
                    this.videoIsPlaying = anyVideoPlaying;
                }, 100);
            }
        }, true);
    }

    trackAudioPlayback() {
        // Monitor all audio elements
        const checkAudio = () => {
            const audioElements = document.querySelectorAll('audio');
            let anyAudioPlaying = false;
            
            audioElements.forEach(audio => {
                if (!audio.paused && !audio.ended && audio.readyState > 2) {
                    anyAudioPlaying = true;
                }
            });
            
            this.audioIsPlaying = anyAudioPlaying;
        };

        // Check audio every 500ms
        setInterval(checkAudio, 500);

        // Also listen for audio events
        document.addEventListener('play', (e) => {
            if (e.target.tagName === 'AUDIO') {
                this.audioIsPlaying = true;
            }
        }, true);

        document.addEventListener('pause', (e) => {
            if (e.target.tagName === 'AUDIO') {
                // Recheck all audio after pause event
                setTimeout(() => {
                    const audioElements = document.querySelectorAll('audio');
                    let anyAudioPlaying = false;
                    audioElements.forEach(audio => {
                        if (!audio.paused && !audio.ended && audio.readyState > 2) {
                            anyAudioPlaying = true;
                        }
                    });
                    this.audioIsPlaying = anyAudioPlaying;
                }, 100);
            }
        }, true);
    }

    startIdleCheckLoop() {
        setInterval(() => {
            const now = Date.now();
            const timeSinceLastActivity = Math.min(
                now - this.lastMouseMovement,
                now - this.lastKeyPress,
                now - this.lastScrollEvent
            );

            // Update idle detection flags
            this.noMouseMovement = (now - this.lastMouseMovement) > this.idleThreshold;
            this.noKeyPress = (now - this.lastKeyPress) > this.idleThreshold;

            // Calculate comprehensive idle state
            const isActuallyIdle = (
                this.noMouseMovement &&
                this.noKeyPress &&
                !this.videoIsPlaying &&
                !this.audioIsPlaying &&
                !this.scrollingIsDetected &&
                this.tabIsInFocus &&
                timeSinceLastActivity > this.idleThreshold
            );

            // Send idle state to background script
            try {
                chrome.runtime.sendMessage({
                    action: 'updateIdleState',
                    isIdle: isActuallyIdle,
                    idleDetails: {
                        noMouseMovement: this.noMouseMovement,
                        noKeyPress: this.noKeyPress,
                        videoIsPlaying: this.videoIsPlaying,
                        audioIsPlaying: this.audioIsPlaying,
                        scrollingIsDetected: this.scrollingIsDetected,
                        tabIsInFocus: this.tabIsInFocus,
                        timeSinceLastActivity: timeSinceLastActivity
                    }
                });
            } catch (error) {
                // Background script may not be available, ignore
            }
        }, 1000); // Check every second
    }

    setupIdleDetection() {
        console.log('🔍 Setting up smart idle detection...');
        
        // Track mouse movement
        document.addEventListener('mousemove', () => {
            this.lastMouseMovement = Date.now();
            this.noMouseMovement = false;
        }, { passive: true });

        // Track key presses
        document.addEventListener('keydown', () => {
            this.lastKeyPress = Date.now();
            this.noKeyPress = false;
        }, { passive: true });

        // Track scrolling
        document.addEventListener('scroll', () => {
            this.lastScrollEvent = Date.now();
            this.scrollingIsDetected = true;
            // Reset scrolling flag after 2 seconds
            setTimeout(() => {
                this.scrollingIsDetected = false;
            }, 2000);
        }, { passive: true });

        // Track tab focus
        document.addEventListener('visibilitychange', () => {
            this.tabIsInFocus = !document.hidden;
        });

        window.addEventListener('focus', () => {
            this.tabIsInFocus = true;
        });

        window.addEventListener('blur', () => {
            this.tabIsInFocus = false;
        });

        // Track video playback
        this.trackVideoPlayback();
        
        // Track audio playback
        this.trackAudioPlayback();

        // Start idle checking loop
        this.startIdleCheckLoop();
    }

    trackVideoPlayback() {
        // Monitor all video elements
        const checkVideos = () => {
            const videos = document.querySelectorAll('video');
            let anyVideoPlaying = false;
            
            videos.forEach(video => {
                if (!video.paused && !video.ended && video.readyState > 2) {
                    anyVideoPlaying = true;
                }
            });
            
            this.videoIsPlaying = anyVideoPlaying;
        };

        // Check videos every 500ms
        setInterval(checkVideos, 500);

        // Also listen for video events
        document.addEventListener('play', (e) => {
            if (e.target.tagName === 'VIDEO') {
                this.videoIsPlaying = true;
            }
        }, true);

        document.addEventListener('pause', (e) => {
            if (e.target.tagName === 'VIDEO') {
                // Recheck all videos after pause event
                setTimeout(() => {
                    const videos = document.querySelectorAll('video');
                    let anyVideoPlaying = false;
                    videos.forEach(video => {
                        if (!video.paused && !video.ended && video.readyState > 2) {
                            anyVideoPlaying = true;
                        }
                    });
                    this.videoIsPlaying = anyVideoPlaying;
                }, 100);
            }
        }, true);
    }

    trackAudioPlayback() {
        // Monitor all audio elements
        const checkAudio = () => {
            const audioElements = document.querySelectorAll('audio');
            let anyAudioPlaying = false;
            
            audioElements.forEach(audio => {
                if (!audio.paused && !audio.ended && audio.readyState > 2) {
                    anyAudioPlaying = true;
                }
            });
            
            this.audioIsPlaying = anyAudioPlaying;
        };

        // Check audio every 500ms
        setInterval(checkAudio, 500);

        // Also listen for audio events
        document.addEventListener('play', (e) => {
            if (e.target.tagName === 'AUDIO') {
                this.audioIsPlaying = true;
            }
        }, true);

        document.addEventListener('pause', (e) => {
            if (e.target.tagName === 'AUDIO') {
                // Recheck all audio after pause event
                setTimeout(() => {
                    const audioElements = document.querySelectorAll('audio');
                    let anyAudioPlaying = false;
                    audioElements.forEach(audio => {
                        if (!audio.paused && !audio.ended && audio.readyState > 2) {
                            anyAudioPlaying = true;
                        }
                    });
                    this.audioIsPlaying = anyAudioPlaying;
                }, 100);
            }
        }, true);
    }

    startIdleCheckLoop() {
        setInterval(() => {
            const now = Date.now();
            const timeSinceLastActivity = Math.min(
                now - this.lastMouseMovement,
                now - this.lastKeyPress,
                now - this.lastScrollEvent
            );

            // Update idle detection flags
            this.noMouseMovement = (now - this.lastMouseMovement) > this.idleThreshold;
            this.noKeyPress = (now - this.lastKeyPress) > this.idleThreshold;

            // Calculate comprehensive idle state
            const isActuallyIdle = (
                this.noMouseMovement &&
                this.noKeyPress &&
                !this.videoIsPlaying &&
                !this.audioIsPlaying &&
                !this.scrollingIsDetected &&
                this.tabIsInFocus &&
                timeSinceLastActivity > this.idleThreshold
            );

            // Send idle state to background script
            try {
                chrome.runtime.sendMessage({
                    action: 'updateIdleState',
                    isIdle: isActuallyIdle,
                    idleDetails: {
                        noMouseMovement: this.noMouseMovement,
                        noKeyPress: this.noKeyPress,
                        videoIsPlaying: this.videoIsPlaying,
                        audioIsPlaying: this.audioIsPlaying,
                        scrollingIsDetected: this.scrollingIsDetected,
                        tabIsInFocus: this.tabIsInFocus,
                        timeSinceLastActivity: timeSinceLastActivity
                    }
                });
            } catch (error) {
                // Background script may not be available, ignore
            }
        }, 1000); // Check every second
    }
}

// Initialize content script
new ContentScriptManager();