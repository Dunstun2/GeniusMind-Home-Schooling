/**
 * Banner CTA Handler - REALISTIC VERSION
 * Handles predefined call-to-action button clicks based on actual pages and features
 */

// CTA Action Map - Only includes actions that exist in your system
const CTA_ACTIONS = {
    // Contact & Booking - All lead to booking form
    'book_session': {
        text: 'Book a Session',
        handler: () => scrollToElement('#contact')
    },
    'whatsapp_chat': {
        text: 'Chat on WhatsApp',
        handler: () => openWhatsApp()
    },
    'call_us': {
        text: 'Call Us',
        handler: () => window.location.href = 'tel:+254743322975'
    },
    'email_us': {
        text: 'Email Us',
        handler: () => window.location.href = 'mailto:geniusminds2425@gmail.com'
    },

    // Navigation - Actual pages that exist
    'view_courses': {
        text: 'View Our Courses',
        handler: () => window.location.href = '/courses.html'
    },
    'learn_more_about': {
        text: 'Learn More About Us',
        handler: () => window.location.href = '/about.html'
    },
    'view_blog': {
        text: 'Read Our Blog',
        handler: () => window.location.href = '/blog.html'
    },
    'view_faq': {
        text: 'View FAQs',
        handler: () => window.location.href = '/faq.html'
    },

    // Page Sections - Scroll to sections on index.html
    'scroll_home': {
        text: 'Go to Home',
        handler: () => {
            if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
                window.location.href = '/#home';
            } else {
                scrollToElement('#home');
            }
        }
    },
    'scroll_about': {
        text: 'About Us',
        handler: () => scrollToElement('#about')
    },
    'scroll_services': {
        text: 'Our Services',
        handler: () => scrollToElement('#services')
    },
    'scroll_contact': {
        text: 'Contact Us',
        handler: () => scrollToElement('#contact')
    }
};

/**
 * Smooth scroll to an element
 */
function scrollToElement(selector) {
    const element = document.querySelector(selector);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        // If element doesn't exist on current page, try to navigate to home with hash
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            window.location.href = '/' + selector;
        }
    }
}

/**
 * Open WhatsApp chat with pre-filled message
 */
function openWhatsApp() {
    const phone = '254743322975'; // Kenya format without +
    const message = encodeURIComponent('Hello! I would like to inquire about your homeschooling programs.');
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
}

/**
 * Get CTA button text for a given action code
 */
function getCtaText(actionCode) {
    return CTA_ACTIONS[actionCode]?.text || 'Learn More';
}

/**
 * Execute CTA action when button is clicked
 */
function executeCtaAction(actionCode) {
    const action = CTA_ACTIONS[actionCode];
    if (action && action.handler) {
        action.handler();
    } else {
        console.warn('Unknown CTA action:', actionCode);
        // Fallback: scroll to contact
        scrollToElement('#contact');
    }
}

/**
 * Initialize all CTA buttons on the page
 * Call this after banners are dynamically loaded
 */
function initializeBannerCtas() {
    document.querySelectorAll('[data-cta-action]').forEach(button => {
        const actionCode = button.getAttribute('data-cta-action');

        // Set button text if not already set
        if (!button.textContent.trim()) {
            button.textContent = getCtaText(actionCode);
        }

        // Add click handler
        button.addEventListener('click', (e) => {
            e.preventDefault();
            executeCtaAction(actionCode);
        });
    });
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBannerCtas);
} else {
    initializeBannerCtas();
}

// Export for use in other scripts
window.BannerCTA = {
    getCtaText,
    executeCtaAction,
    initializeBannerCtas,
    CTA_ACTIONS
};
