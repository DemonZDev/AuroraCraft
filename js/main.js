/**
 * AuroraCraft - Main Application JavaScript
 * Handles navbar, scroll animations, and general functionality
 */

(function () {
    'use strict';

    // =====================================================
    // NAVBAR FUNCTIONALITY
    // =====================================================

    const navbar = document.getElementById('navbar');
    const navbarToggle = document.getElementById('navbar-toggle');
    const navbarMenu = document.getElementById('navbar-menu');

    // Handle navbar scroll effect
    function handleNavbarScroll() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }

    // Mobile menu toggle
    function toggleMobileMenu() {
        const isExpanded = navbarToggle.getAttribute('aria-expanded') === 'true';
        navbarToggle.setAttribute('aria-expanded', !isExpanded);
        navbarMenu.classList.toggle('active');

        // Prevent body scroll when menu is open
        document.body.style.overflow = !isExpanded ? 'hidden' : '';
    }

    // Close mobile menu on link click
    function setupMobileMenuLinks() {
        const menuLinks = navbarMenu.querySelectorAll('a');
        menuLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (navbarMenu.classList.contains('active')) {
                    toggleMobileMenu();
                }
            });
        });
    }

    // Initialize navbar
    if (navbar && navbarToggle && navbarMenu) {
        window.addEventListener('scroll', handleNavbarScroll, { passive: true });
        navbarToggle.addEventListener('click', toggleMobileMenu);
        setupMobileMenuLinks();
        handleNavbarScroll(); // Initial check
    }

    // =====================================================
    // SMOOTH SCROLL
    // =====================================================

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                const navHeight = navbar ? navbar.offsetHeight : 0;
                const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // =====================================================
    // ENHANCED SCROLL ANIMATIONS (Intersection Observer)
    // =====================================================

    const animatedElements = document.querySelectorAll('[data-animate]');

    const animationObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                }
            });
        },
        {
            root: null,
            rootMargin: '0px 0px -100px 0px',
            threshold: 0.1
        }
    );

    animatedElements.forEach(el => animationObserver.observe(el));

    // =====================================================
    // FEATURE, SHOWCASE, & STEP CARD ANIMATIONS
    // =====================================================

    const cards = document.querySelectorAll('.feature-card, .showcase-card, .step, .section-header, .cta-title, .cta-buttons');

    const cardObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    cardObserver.unobserve(entry.target);
                }
            });
        },
        {
            root: null,
            rootMargin: '0px 0px -80px 0px',
            threshold: 0.15
        }
    );

    cards.forEach(card => cardObserver.observe(card));

    // =====================================================
    // MOUSE TRACKING FOR CARD GLOW EFFECT
    // =====================================================

    const glowCards = document.querySelectorAll('.feature-card');

    glowCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            card.style.setProperty('--mouse-x', `${x}%`);
            card.style.setProperty('--mouse-y', `${y}%`);
        });
    });

    // =====================================================
    // TILT EFFECT FOR SHOWCASE CARDS
    // =====================================================

    const tiltCards = document.querySelectorAll('[data-tilt]');

    tiltCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = (y - centerY) / 20;
            const rotateY = (centerX - x) / 20;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
        });
    });

    // =====================================================
    // PARALLAX EFFECT FOR HERO ORBS
    // =====================================================

    const orbs = document.querySelectorAll('.orb');

    function handleParallax(e) {
        if (window.innerWidth < 768) return; // Disable on mobile

        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;

        orbs.forEach((orb, index) => {
            const speed = (index + 1) * 20;
            const moveX = (x - 0.5) * speed;
            const moveY = (y - 0.5) * speed;

            orb.style.transform = `translate(${moveX}px, ${moveY}px)`;
        });
    }

    document.addEventListener('mousemove', handleParallax, { passive: true });

    // =====================================================
    // ACTIVE SECTION HIGHLIGHTING
    // =====================================================

    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.navbar-links a');

    function highlightActiveSection() {
        const scrollPosition = window.scrollY + 150;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');

            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }

    window.addEventListener('scroll', highlightActiveSection, { passive: true });

    // =====================================================
    // KEYBOARD ACCESSIBILITY
    // =====================================================

    // Skip link functionality
    const skipLink = document.querySelector('.skip-link');
    if (skipLink) {
        skipLink.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(skipLink.getAttribute('href'));
            if (target) {
                target.focus();
            }
        });
    }

    // Focus trap for mobile menu
    function trapFocus(element) {
        const focusableElements = element.querySelectorAll(
            'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select'
        );

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        element.addEventListener('keydown', function (e) {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        lastFocusable.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        firstFocusable.focus();
                        e.preventDefault();
                    }
                }
            }

            // Close on Escape
            if (e.key === 'Escape') {
                if (navbarMenu.classList.contains('active')) {
                    toggleMobileMenu();
                    navbarToggle.focus();
                }
            }
        });
    }

    if (navbarMenu) {
        trapFocus(navbarMenu);
    }

    // =====================================================
    // LOADING STATE
    // =====================================================

    // Remove loading state when page is ready
    window.addEventListener('load', () => {
        document.body.classList.add('loaded');

        // Trigger initial animations after a small delay
        setTimeout(() => {
            document.body.classList.add('animations-ready');
        }, 100);
    });

    // =====================================================
    // CONSOLE GREETING
    // =====================================================

    console.log(
        '%c✨ AuroraCraft %c\nBuild without limits. Create without code.\nhttps://auroracraft.xyz',
        'font-size: 24px; font-weight: bold; background: linear-gradient(135deg, #9333ea, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent;',
        'font-size: 12px; color: #a1a1aa;'
    );

})();
