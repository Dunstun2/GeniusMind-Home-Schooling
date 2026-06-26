// Genius Minds Analytics Tracking Script
(function () {
    // Generate a random unique key for the session
    function generateSessionKey() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let key = 'gm_';
        for (let i = 0; i < 24; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return key;
    }

    // Retrieve or create session key
    let sessionKey = sessionStorage.getItem('gm_session_key');
    if (!sessionKey) {
        sessionKey = generateSessionKey();
        sessionStorage.setItem('gm_session_key', sessionKey);
    }

    // Backend Analytics Endpoints
    const SESSION_ENDPOINT = '/api/analytics/session';
    const EVENT_ENDPOINT = '/api/analytics/event';

    // Queue/Send helper
    async function sendAnalytics(url, data) {
        try {
            await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data),
                keepalive: true // Allows request to succeed even if page is closing
            });
        } catch (err) {
            // Silently swallow analytics errors to avoid breaking the main UI
            console.warn('Analytics transmission failure:', err);
        }
    }

    // Register/Ping the Session
    function registerSession() {
        sendAnalytics(SESSION_ENDPOINT, {
            sessionKey: sessionKey,
            referrer: document.referrer || 'Direct',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
        });
    }

    // Log a Specific Interaction Event
    function logEvent(type, name, data = null) {
        sendAnalytics(EVENT_ENDPOINT, {
            sessionKey: sessionKey,
            eventType: type,
            eventName: name,
            eventData: data
        });
    }

    // Detect current page name from URL path
    function getPageName() {
        const path = window.location.pathname.toLowerCase();
        if (path === '/' || path === '/index.html' || path === '') return 'Home';
        if (path.includes('about')) return 'About';
        if (path.includes('contact')) return 'Contact';
        if (path.includes('blog-post')) return 'Blog Post';
        if (path.includes('blog')) return 'Blog';
        if (path.includes('courses')) return 'Courses';
        if (path.includes('faq')) return 'FAQ';
        if (path.includes('track')) return 'Booking Tracker';
        return path.replace(/\//g, '').replace('.html', '') || 'Home';
    }

    const currentPage = getPageName();

    // Initialization
    registerSession();
    logEvent('pageview', `view_${currentPage.toLowerCase().replace(/\s/g,'_')}`, {
        url: window.location.pathname,
        page: currentPage
    });

    // Track scroll depth (only once per section)
    const trackedSections = new Set();
    const sectionsToTrack = ['about', 'services', 'curriculum', 'contact'];

    function checkScrollDepth() {
        sectionsToTrack.forEach(id => {
            if (trackedSections.has(id)) return;
            
            const element = document.getElementById(id);
            if (element) {
                const rect = element.getBoundingClientRect();
                // Check if the top of the section is visible in the viewport
                if (rect.top <= window.innerHeight * 0.8) {
                    trackedSections.add(id);
                    logEvent('scroll_view', `view_section_${id}`);
                }
            }
        });
    }

    // Debounce scroll listener
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(checkScrollDepth, 200);
    });

    // Track standard interactive element clicks
    document.addEventListener('DOMContentLoaded', () => {
        // Initial scroll check on load
        setTimeout(checkScrollDepth, 500);

        // Track clicks on phone links
        document.querySelectorAll('a[href^="tel:"]').forEach(el => {
            el.addEventListener('click', () => {
                logEvent('click', 'click_call_number', { number: el.getAttribute('href') });
            });
        });

        // Track clicks on mail links
        document.querySelectorAll('a[href^="mailto:"]').forEach(el => {
            el.addEventListener('click', () => {
                logEvent('click', 'click_send_email', { email: el.getAttribute('href') });
            });
        });

        // Track navigation clicks
        document.querySelectorAll('.nav-links a').forEach(el => {
            el.addEventListener('click', () => {
                logEvent('click', `nav_click_${el.getAttribute('href').substring(1)}`);
            });
        });

        // Track Theme Toggles
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
                // Note: log the theme BEFORE toggle triggers in main script
                const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
                logEvent('setting_change', 'toggle_theme', { theme: nextTheme });
            });
        }

        // Track preferred service selection dropdown interaction
        const serviceSelect = document.getElementById('service');
        if (serviceSelect) {
            serviceSelect.addEventListener('change', () => {
                logEvent('form_interaction', 'select_service', { value: serviceSelect.value });
            });
        }

        // Heartbeat Keepalive (every 45 seconds to keep session active for real-time GA count)
        setInterval(() => {
            logEvent('heartbeat', 'keepalive');
        }, 45000);
    });

    // Expose analytics globally if frontend script wants to log custom events
    window.GM_Analytics = { logEvent };
})();
