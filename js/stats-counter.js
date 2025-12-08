/**
 * AuroraCraft - Stats Counter
 * Animated number counters that trigger on scroll visibility
 */

class StatsCounter {
    constructor() {
        this.stats = document.querySelectorAll('.stat-value[data-target]');
        this.animated = new Set();
        this.observer = null;

        if (this.stats.length > 0) {
            this.init();
        }
    }

    init() {
        // Create Intersection Observer
        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            {
                root: null,
                rootMargin: '0px',
                threshold: 0.5
            }
        );

        // Observe all stat elements
        this.stats.forEach(stat => this.observer.observe(stat));
    }

    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting && !this.animated.has(entry.target)) {
                this.animated.add(entry.target);
                this.animateCounter(entry.target);
            }
        });
    }

    animateCounter(element) {
        const target = parseFloat(element.dataset.target);
        const suffix = element.dataset.suffix || '';
        const duration = 2000; // 2 seconds
        const startTime = performance.now();
        const isDecimal = target % 1 !== 0;

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function (ease-out cubic)
            const easeOut = 1 - Math.pow(1 - progress, 3);

            const current = target * easeOut;

            // Format based on whether it's a decimal
            if (isDecimal) {
                element.textContent = current.toFixed(1) + suffix;
            } else {
                // Add thousands separator
                element.textContent = Math.round(current).toLocaleString() + suffix;
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Ensure final value is exact
                if (isDecimal) {
                    element.textContent = target.toFixed(1) + suffix;
                } else {
                    element.textContent = target.toLocaleString() + suffix;
                }
            }
        };

        requestAnimationFrame(animate);
    }

    // Clean up observer
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.statsCounter = new StatsCounter();
});
