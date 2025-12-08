/**
 * AuroraCraft - Platform Tabs
 * Handles switching between Minecraft, Discord, and Web Apps content
 */

class PlatformTabs {
    constructor() {
        this.tabs = document.querySelectorAll('.tab-btn');
        this.headlines = document.querySelectorAll('.headline-container');
        this.currentTab = 'minecraft';

        if (this.tabs.length > 0) {
            this.init();
        }
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        this.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabId = e.currentTarget.dataset.tab;
                this.switchTab(tabId);
            });

            // Keyboard support
            tab.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const tabId = e.currentTarget.dataset.tab;
                    this.switchTab(tabId);
                }

                // Arrow key navigation
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.navigateTabs(e.key === 'ArrowRight' ? 1 : -1);
                }
            });
        });
    }

    switchTab(tabId) {
        if (this.currentTab === tabId) return;

        this.currentTab = tabId;

        // Update tab buttons
        this.tabs.forEach(tab => {
            const isActive = tab.dataset.tab === tabId;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive);
        });

        // Update headlines with animation
        this.headlines.forEach(headline => {
            const isActive = headline.dataset.headline === tabId;

            if (isActive) {
                headline.classList.add('active');
            } else {
                headline.classList.remove('active');
            }
        });
    }

    navigateTabs(direction) {
        const tabIds = ['minecraft', 'discord', 'webapps'];
        const currentIndex = tabIds.indexOf(this.currentTab);
        let newIndex = currentIndex + direction;

        // Wrap around
        if (newIndex < 0) newIndex = tabIds.length - 1;
        if (newIndex >= tabIds.length) newIndex = 0;

        const newTabId = tabIds[newIndex];
        this.switchTab(newTabId);

        // Focus the new tab
        const newTab = document.querySelector(`[data-tab="${newTabId}"]`);
        if (newTab) newTab.focus();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.platformTabs = new PlatformTabs();
});
