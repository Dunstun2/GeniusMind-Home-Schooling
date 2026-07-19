// Utility helper to escape HTML and prevent XSS
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Mobile Menu Handler - Set up once at document level (OUTSIDE DOMContentLoaded)
let mobileMenuHandlerAttached = false;
function setupMobileMenuHandler() {
    if (mobileMenuHandlerAttached) return; // Prevent duplicate handlers

    document.addEventListener('click', function (e) {
        // Debug: Log all clicks
        console.log('Click detected on:', e.target);

        const mobileMenuBtn = e.target.closest('.mobile-menu-btn');
        if (mobileMenuBtn) {
            console.log('Mobile menu button clicked!');
            e.preventDefault();
            e.stopPropagation();

            const navLinks = document.querySelector('.nav-links');
            if (navLinks) {
                mobileMenuBtn.classList.toggle('active');
                navLinks.classList.toggle('active');
                console.log('Menu toggled. Active:', navLinks.classList.contains('active'));
            } else {
                console.log('Nav links not found!');
            }
            return;
        }

        // Close mobile menu when clicking nav links
        const navLink = e.target.closest('.nav-links a');
        if (navLink) {
            console.log('Nav link clicked, closing menu');
            const navLinks = document.querySelector('.nav-links');
            const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
            if (navLinks) navLinks.classList.remove('active');
            if (mobileMenuBtn) mobileMenuBtn.classList.remove('active');
        }
    }, true); // Use capture phase

    mobileMenuHandlerAttached = true;
    console.log('Mobile menu handler attached');
}

// Set up mobile menu handler immediately (before DOM is ready)
setupMobileMenuHandler();

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load Navbar and Footer Components first
    await loadComponents();

    // 2. Initialize Shared UI listeners (Theme, Navbar scroll, Year, etc.)
    initializeGlobalUI();

    // 3. Page-Specific CMS Content Loader
    loadPageSpecificData();

    // Booking form submission
    const bookingForm = document.getElementById('bookingForm');
    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const btn = bookingForm.querySelector('button[type="submit"]');
            const originalText = btn.textContent;

            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const phone = document.getElementById('phone').value;
            const service = document.getElementById('service').value;
            const message = document.getElementById('message').value;

            btn.textContent = 'Sending...';
            btn.disabled = true;

            try {
                const response = await fetch('/api/bookings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, email, phone, service, message })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    // Log success event to analytics
                    if (window.GM_Analytics) {
                        window.GM_Analytics.logEvent('form_submit', 'submit_booking_success', { service });
                    }

                    alert('Thank you! Your booking request has been received. We will contact you shortly.');
                    bookingForm.reset();
                } else {
                    throw new Error(result.error || 'Failed to submit booking request.');
                }
            } catch (err) {
                console.error('Submission error:', err);
                if (window.GM_Analytics) {
                    window.GM_Analytics.logEvent('form_submit', 'submit_booking_failure', { error: err.message });
                }
                alert(`Error: ${err.message || 'Something went wrong. Please try again.'}`);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }

    // Smooth scroll for anchor links
    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a[href^="#"]');
        if (!anchor) return;

        const targetId = anchor.getAttribute('href');
        if (targetId === '#') return;

        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            e.preventDefault();
            const navHeight = document.querySelector('.navbar').offsetHeight || 70;
            const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - navHeight;

            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });

            // Close mobile menu links
            const navLinks = document.querySelector('.nav-links');
            const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
            if (navLinks) navLinks.classList.remove('active');
            if (mobileMenuBtn) mobileMenuBtn.classList.remove('active');
        }
    });

    // Component Loader function
    async function loadComponents() {
        const navPlaceholder = document.getElementById('navbar-placeholder');
        const footerPlaceholder = document.getElementById('footer-placeholder');

        if (navPlaceholder) {
            try {
                const response = await fetch('/components/navbar.html');
                if (response.ok) {
                    navPlaceholder.outerHTML = await response.text();
                }
            } catch (err) {
                console.error('Failed to load navbar component:', err);
            }
        }

        if (footerPlaceholder) {
            try {
                const response = await fetch('/components/footer.html');
                if (response.ok) {
                    footerPlaceholder.outerHTML = await response.text();
                }
            } catch (err) {
                console.error('Failed to load footer component:', err);
            }
        }
    }

    // Shared global UI initializer
    function initializeGlobalUI() {
        // Theme Toggle
        const themeToggle = document.getElementById('theme-toggle');
        const htmlElement = document.documentElement;

        const savedTheme = localStorage.getItem('theme');
        const osPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (savedTheme === 'dark' || (!savedTheme && osPrefersDark)) {
            htmlElement.setAttribute('data-theme', 'dark');
        }

        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                if (htmlElement.getAttribute('data-theme') === 'dark') {
                    htmlElement.removeAttribute('data-theme');
                    localStorage.setItem('theme', 'light');
                } else {
                    htmlElement.setAttribute('data-theme', 'dark');
                    localStorage.setItem('theme', 'dark');
                }
            });
        }

        // Mobile menu handler is already set up globally - don't add it here

        // Navbar scroll effect
        const navbar = document.querySelector('.navbar');
        if (navbar) {
            window.addEventListener('scroll', () => {
                if (window.scrollY > 50) {
                    navbar.classList.add('scrolled');
                } else {
                    navbar.classList.remove('scrolled');
                }
            });
        }

        // Set current year in footer
        const yearEl = document.getElementById('year');
        if (yearEl) {
            yearEl.textContent = new Date().getFullYear();
        }

        // Fetch contacts site settings
        fetchSiteSettings();

        // Fetch and render social media links
        fetchSocialMedia();

        // Highlight the active page nav link
        highlightActiveNavLink();
    }

    // Mark the current page link as active in the navbar
    function highlightActiveNavLink() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const navLinks = document.querySelectorAll('.nav-links a');
        navLinks.forEach(link => {
            const linkPage = link.getAttribute('href');
            if (linkPage === currentPage || (currentPage === '' && linkPage === 'index.html')) {
                link.classList.add('active-page');
            }
        });
    }

    // Dynamic data page router loader
    function loadPageSpecificData() {
        // 1. About Page Content
        if (document.getElementById('about-page-container')) {
            loadAboutPageData();
        }
        // 2. Courses Page Content
        if (document.getElementById('courses-page-container')) {
            loadCoursesPageData();
        }
        // 3. FAQs Page Content
        if (document.getElementById('faq-page-container')) {
            loadFaqPageData();
        }
        // 4. Blog Page Content
        if (document.getElementById('blog-page-container')) {
            loadBlogPageData();
        }
        // 5. Blog Post Detail Page Content
        if (document.getElementById('blog-post-container')) {
            loadBlogPostDetailData();
        }
    }

    // ABOUT PAGE DATA LOADER
    async function loadAboutPageData() {
        const teamGrid = document.getElementById('team-grid');

        // Load page content (mission, vision, history, philosophy)
        try {
            const res = await fetch('/api/content');
            if (res.ok) {
                const content = await res.json();

                const missionEl = document.getElementById('mission-text');
                const visionEl = document.getElementById('vision-text');
                const historyEl = document.getElementById('history-text');
                const philosophyEl = document.getElementById('philosophy-text');

                if (missionEl && content.mission_statement) missionEl.textContent = content.mission_statement;
                if (visionEl && content.vision) visionEl.textContent = content.vision;
                if (historyEl && content.history) historyEl.innerHTML = content.history.replace(/\n/g, '<br>');
                if (philosophyEl && content.teaching_philosophy) philosophyEl.innerHTML = content.teaching_philosophy.replace(/\n/g, '<br>');
            }
        } catch (e) {
            console.error('Error loading about text content:', e);
        }

        // Load team members
        if (teamGrid) {
            teamGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">Loading team members...</div>';
            try {
                const res = await fetch('/api/team');
                if (res.ok) {
                    const team = await res.json();
                    teamGrid.innerHTML = '';
                    if (team.length === 0) {
                        teamGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">No team members added yet.</div>';
                        return;
                    }
                    team.forEach(member => {
                        const card = document.createElement('div');
                        card.className = 'about-card glass-card';
                        card.style.textAlign = 'center';
                        card.style.padding = '30px';

                        const img = member.image_url || '/assets/images/placeholder-avatar.png';
                        card.innerHTML = `
                            <div class="team-avatar-wrapper" style="width: 110px; height: 110px; margin: 0 auto 20px auto; border-radius: 50%; overflow: hidden; border: 3px solid var(--primary-color); box-shadow: 0 8px 30px rgba(0,0,0,0.15);">
                                <img src="${img}" alt="${escapeHTML(member.name)}" style="width:100%; height:100%; object-fit:cover;">
                            </div>
                            <h3 style="font-size:20px; font-weight:700; margin-bottom:6px; color:var(--text-main);">${escapeHTML(member.name)}</h3>
                            <strong style="display:block; font-size:14px; font-weight:600; color:var(--primary-color); margin-bottom:15px;">${escapeHTML(member.role)}</strong>
                            <p style="font-size:14px; color:var(--text-muted); line-height:1.6; text-align:center;">${escapeHTML(member.bio || '')}</p>
                        `;
                        teamGrid.appendChild(card);
                    });
                }
            } catch (e) {
                teamGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#ef4444;">Failed to load team members.</div>';
            }
        }
    }

    // COURSES PAGE DATA LOADER
    async function loadCoursesPageData() {
        const coursesGrid = document.getElementById('courses-grid');
        if (!coursesGrid) return;

        coursesGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">Loading courses...</div>';
        try {
            const res = await fetch('/api/courses');
            if (res.ok) {
                const courses = await res.json();
                coursesGrid.innerHTML = '';
                if (courses.length === 0) {
                    coursesGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">No programs available at this time.</div>';
                    return;
                }
                courses.forEach(course => {
                    const card = document.createElement('div');
                    card.className = 'service-card glass-card';

                    // Build outcomes html list
                    let outcomesList = '';
                    if (course.outcomes) {
                        outcomesList = '<ul style="margin: 15px 0 0 0; padding: 0; list-style: none; text-align: left; font-size: 13px; color: var(--text-muted); display:flex; flex-direction:column; gap:6px;">';
                        course.outcomes.split('\n').forEach(o => {
                            if (o.trim()) {
                                outcomesList += `<li style="display:flex; gap:8px;"><span style="color:#10b981;">✓</span> <span>${escapeHTML(o.trim())}</span></li>`;
                            }
                        });
                        outcomesList += '</ul>';
                    }

                    // Subjects list
                    let subjectsHtml = '';
                    if (course.subjects) {
                        subjectsHtml = `
                            <div style="margin-bottom:12px; font-size:12px; color:var(--primary-color); background:rgba(99,102,241,0.08); padding:6px 12px; border-radius:20px; display:inline-block; border:1px solid rgba(99,102,241,0.15); font-weight:600;">
                                📖 ${escapeHTML(course.subjects)}
                            </div>
                        `;
                    }

                    card.innerHTML = `
                        <div class="service-content" style="padding: 30px;">
                            ${subjectsHtml}
                            <h3 style="font-size:22px; font-weight:700; margin-bottom:10px; color:var(--text-main);">${escapeHTML(course.title)}</h3>
                            <div style="display:flex; gap:10px; flex-wrap:wrap; font-size:13px; font-weight:600; color:var(--text-muted); margin-bottom:15px;">
                                <span>🎓 ${escapeHTML(course.grade_levels || 'All Grades')}</span>
                                <span>•</span>
                                <span>⏱️ ${escapeHTML(course.duration || 'Flexible')}</span>
                                <span>•</span>
                                <span style="color:var(--secondary-color);">💰 ${escapeHTML(course.fees || 'Contact us')}</span>
                            </div>
                            <p style="font-size:14.5px; color:var(--text-muted); line-height:1.6; text-align:left; margin-bottom:20px; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:15px;">${escapeHTML(course.description || '')}</p>
                            ${outcomesList}
                            <div style="margin-top:25px; text-align:center;">
                                <a href="contact.html?program=${encodeURIComponent(course.title)}" class="btn btn-primary btn-block">Enroll in Program &rarr;</a>
                            </div>
                        </div>
                    `;
                    coursesGrid.appendChild(card);
                });
            }
        } catch (e) {
            coursesGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#ef4444;">Failed to load courses.</div>';
        }
    }

    // FAQ PAGE DATA LOADER
    async function loadFaqPageData() {
        const faqAccordion = document.getElementById('faq-accordion');
        if (!faqAccordion) return;

        faqAccordion.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Loading FAQs...</div>';
        try {
            const res = await fetch('/api/faqs');
            if (res.ok) {
                const faqs = await res.json();
                faqAccordion.innerHTML = '';
                if (faqs.length === 0) {
                    faqAccordion.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No FAQs available.</div>';
                    return;
                }
                faqs.forEach(faq => {
                    const item = document.createElement('div');
                    item.className = 'faq-item glass-card';
                    item.innerHTML = `
                        <button class="faq-question">
                            <span>${escapeHTML(faq.question)}</span>
                            <span class="faq-toggle-icon">+</span>
                        </button>
                        <div class="faq-answer">
                            <p>${escapeHTML(faq.answer)}</p>
                        </div>
                    `;
                    faqAccordion.appendChild(item);
                });

                // Attach Accordion click handlers dynamically
                faqAccordion.querySelectorAll('.faq-question').forEach(question => {
                    question.addEventListener('click', () => {
                        const faqItem = question.parentElement;
                        const answer = question.nextElementSibling;
                        const toggleIcon = question.querySelector('.faq-toggle-icon');

                        const isActive = faqItem.classList.contains('active');

                        faqAccordion.querySelectorAll('.faq-item').forEach(item => {
                            item.classList.remove('active');
                            const itemAnswer = item.querySelector('.faq-answer');
                            if (itemAnswer) itemAnswer.style.maxHeight = null;
                            const itemIcon = item.querySelector('.faq-toggle-icon');
                            if (itemIcon) itemIcon.textContent = '+';
                        });

                        if (!isActive) {
                            faqItem.classList.add('active');
                            answer.style.maxHeight = answer.scrollHeight + 'px';
                            toggleIcon.textContent = '−';
                        }
                    });
                });
            }
        } catch (e) {
            faqAccordion.innerHTML = '<div style="text-align:center; padding:20px; color:#ef4444;">Failed to load FAQs.</div>';
        }
    }

    // BLOG PAGE DATA LOADER
    async function loadBlogPageData() {
        const blogGrid = document.getElementById('blog-grid');
        if (!blogGrid) return;

        blogGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">Loading articles...</div>';
        try {
            const res = await fetch('/api/blog');
            if (res.ok) {
                const posts = await res.json();
                blogGrid.innerHTML = '';
                if (posts.length === 0) {
                    blogGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">No blog posts published yet. Check back soon!</div>';
                    return;
                }
                posts.forEach(post => {
                    const card = document.createElement('article');
                    card.className = 'service-card glass-card';
                    card.style.display = 'flex';
                    card.style.flexDirection = 'column';
                    card.style.overflow = 'hidden';

                    const img = post.image_url || '/assets/images/blog-placeholder.png';
                    const dateStr = post.created_at ? new Date(post.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';

                    card.innerHTML = `
                        <div style="height: 180px; overflow:hidden; position:relative; border-bottom:1px solid rgba(255,255,255,0.06);">
                            <img src="${img}" alt="${escapeHTML(post.title)}" style="width:100%; height:100%; object-fit:cover; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                            <span style="position:absolute; top:15px; left:15px; background:var(--primary-color); color:#fff; font-size:11px; font-weight:700; text-transform:uppercase; padding:4px 10px; border-radius:20px; box-shadow:0 4px 12px rgba(0,0,0,0.15);">${escapeHTML(post.category || 'General')}</span>
                        </div>
                        <div class="service-content" style="padding: 24px; display:flex; flex-direction:column; flex:1; justify-content:space-between;">
                            <div>
                                <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px; display:flex; gap:10px;">
                                    <span>✍️ ${escapeHTML(post.author || 'Admin')}</span>
                                    <span>•</span>
                                    <span>📅 ${dateStr}</span>
                                </div>
                                <h3 style="font-size:19px; font-weight:700; margin-bottom:10px; color:var(--text-main); line-height:1.4; text-align:left;">${escapeHTML(post.title)}</h3>
                                <p style="font-size:13.5px; color:var(--text-muted); line-height:1.6; text-align:left; margin-bottom:20px;">${escapeHTML(post.excerpt || '')}</p>
                            </div>
                            <div style="text-align:left;">
                                <a href="blog-post.html?id=${post.id}" class="btn btn-text" style="padding:0; font-weight:700;">Read Full Article &rarr;</a>
                            </div>
                        </div>
                    `;
                    blogGrid.appendChild(card);
                });
            }
        } catch (e) {
            blogGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#ef4444;">Failed to load blog posts.</div>';
        }
    }

    // SINGLE BLOG POST DETAIL LOADER
    async function loadBlogPostDetailData() {
        const container = document.getElementById('blog-post-container');
        if (!container) return;

        const urlParams = new URLSearchParams(window.location.search);
        const postId = urlParams.get('id');

        if (!postId) {
            container.innerHTML = '<div style="text-align:center; padding:50px 20px; color:var(--text-muted);"><h3>Article not found</h3><br><a href="blog.html" class="btn btn-primary">Return to Blog</a></div>';
            return;
        }

        container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">Loading article content...</div>';
        try {
            const res = await fetch(`/api/blog/${postId}`);
            if (res.status === 404) {
                container.innerHTML = '<div style="text-align:center; padding:50px 20px; color:var(--text-muted);"><h3>Article not found</h3><br><a href="blog.html" class="btn btn-primary">Return to Blog</a></div>';
                return;
            }
            if (res.ok) {
                const post = await res.json();
                const img = post.image_url || '/assets/images/blog-placeholder.png';
                const dateStr = post.created_at ? new Date(post.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';

                // Set page title metadata
                document.title = `${post.title} | Genius Minds Blog`;

                container.innerHTML = `
                    <div class="glass-card" style="max-width: 900px; margin: 0 auto; border-radius:24px; overflow:hidden;">
                        <div style="height: 350px; width: 100%; border-bottom: 1px solid rgba(255,255,255,0.06); position:relative;">
                            <img src="${img}" alt="${escapeHTML(post.title)}" style="width:100%; height:100%; object-fit:cover;">
                            <span style="position:absolute; bottom:25px; left:25px; background:var(--primary-color); color:#fff; font-size:12px; font-weight:700; text-transform:uppercase; padding:6px 14px; border-radius:20px; box-shadow:0 4px 15px rgba(0,0,0,0.3);">${escapeHTML(post.category || 'General')}</span>
                        </div>
                        <div style="padding: 40px;">
                            <div style="font-size:14px; color:var(--text-muted); margin-bottom:15px; display:flex; gap:15px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom:15px;">
                                <span>✍️ Written by: <strong>${escapeHTML(post.author || 'Admin')}</strong></span>
                                <span>•</span>
                                <span>📅 Published: <strong>${dateStr}</strong></span>
                            </div>
                            <h1 style="font-size:36px; font-weight:800; line-height:1.3; margin-bottom:25px; color:var(--text-main); text-align:left;">${escapeHTML(post.title)}</h1>
                            <div style="font-size:17px; line-height:1.8; color:var(--text-muted); text-align:left; white-space:pre-wrap;">${escapeHTML(post.content || '')}</div>
                            
                            <div style="margin-top:40px; padding-top:25px; border-top:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px;">
                                <a href="blog.html" class="btn btn-outline">&larr; Back to Articles</a>
                                <a href="contact.html?booking_note=${encodeURIComponent('Inquiry from blog post: ' + post.title)}" class="btn btn-primary">Book Consultation &rarr;</a>
                            </div>
                        </div>
                    </div>
                `;
            }
        } catch (e) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#ef4444;">Failed to load the article details.</div>';
        }
    }

    // ==========================================
    // DYNAMIC SITE SETTINGS (Contact Info)
    // ==========================================
    async function fetchSiteSettings() {
        try {
            const response = await fetch('/api/settings');
            if (!response.ok) return;
            const settings = await response.json();

            // Phone
            const phoneEl = document.getElementById('display-phone');
            const phoneLink = document.getElementById('contact-phone-link');
            if (phoneEl && settings.contact_phone) {
                phoneEl.textContent = settings.contact_phone;
                if (phoneLink) phoneLink.href = 'tel:' + settings.contact_phone.replace(/[\s\-]/g, '');
            }

            // Email
            const emailEl = document.getElementById('display-email');
            const emailLink = document.getElementById('contact-email-link');
            if (emailEl && settings.contact_email) {
                emailEl.textContent = settings.contact_email;
                if (emailLink) emailLink.href = 'mailto:' + settings.contact_email;
            }

            // Location
            const locationEl = document.getElementById('display-location');
            if (locationEl && settings.contact_location) {
                locationEl.textContent = settings.contact_location;
            }
        } catch (err) {
            // Silently fail — hardcoded defaults remain visible
        }
    }
    window.fetchSiteSettings = fetchSiteSettings;

    // ==========================================
    // SOCIAL MEDIA LINKS (Dynamic from API)
    // ==========================================
    async function fetchSocialMedia() {
        try {
            const response = await fetch('/api/social-media');
            if (!response.ok) return;
            const links = await response.json();

            // Map platform names to premium SVG icons and brand colors
            const platformMap = {
                tiktok: { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>`, brandClass: 'brand-tiktok' },
                instagram: { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>`, brandClass: 'brand-instagram' },
                x: { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`, brandClass: 'brand-x' },
                twitter: { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`, brandClass: 'brand-x' },
                facebook: { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02Z"/></svg>`, brandClass: 'brand-facebook' },
                linkedin: { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>`, brandClass: 'brand-linkedin' },
                youtube: { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>`, brandClass: 'brand-youtube' },
                whatsapp: { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`, brandClass: 'brand-whatsapp' }
            };

            // Render to footer
            const footerContainer = document.getElementById('footer-social-links');
            if (footerContainer && links.length > 0) {
                footerContainer.innerHTML = links.map(link => {
                    const nameLower = link.name.toLowerCase();
                    const platform = platformMap[nameLower] || { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 13.41c.41.39.41 1.03 0 1.42-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0 5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24 2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24zm2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0 5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24 2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24.973.973 0 0 1 0-1.42z"/></svg>`, brandClass: 'brand-default' };

                    return `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="footer-social-item ${platform.brandClass}" aria-label="${link.name}" title="${link.name}">
                        ${platform.icon}
                    </a>`;
                }).join('');
            }

            // Render to contact page
            const contactContainer = document.getElementById('contact-social-links');
            if (contactContainer && links.length > 0) {
                contactContainer.innerHTML = links.map(link => {
                    const nameLower = link.name.toLowerCase();
                    const platform = platformMap[nameLower] || { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 13.41c.41.39.41 1.03 0 1.42-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0 5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24 2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24zm2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0 5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24 2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24.973.973 0 0 1 0-1.42z"/></svg>`, brandClass: 'brand-default' };

                    return `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="contact-social-item ${platform.brandClass}" aria-label="${link.name}" title="${link.name}">
                        ${platform.icon}
                    </a>`;
                }).join('');
            }
        } catch (err) {
            // Silently fail
        }
    }


    // ==========================================================================
    // Achievements & Events Highlights Slider Controllers (Dynamic API-driven)
    // ==========================================================================
    const highlightsSlider = document.querySelector('.highlights-slider');
    if (highlightsSlider) {
        initHighlightsSlider();
    }

    async function initHighlightsSlider() {
        const sliderContainer = highlightsSlider.querySelector('.slider-container');
        const sliderDotsContainer = highlightsSlider.querySelector('.slider-dots');
        const prevBtn = highlightsSlider.querySelector('.prev-btn');
        const nextBtn = highlightsSlider.querySelector('.next-btn');

        let slides = [];
        let dots = [];
        let currentSlide = 0;
        let slideInterval;
        const SLIDE_DURATION = 12000; // 12 seconds per slide

        try {
            const response = await fetch('/api/banners');
            if (!response.ok) throw new Error('Failed to fetch banners');
            const banners = await response.json();

            if (banners && banners.length > 0) {
                // Clear existing static HTML slides and dots
                sliderContainer.innerHTML = '';
                sliderDotsContainer.innerHTML = '';

                // Build new slides and dots
                banners.forEach((banner, idx) => {
                    // Determine shape colors based on glow_class
                    let shape1Bg = 'var(--primary-light)';
                    let shape2Bg = 'var(--secondary-light)';
                    if (banner.glow_class === 'glow-green') {
                        shape1Bg = '#10b981';
                        shape2Bg = '#34d399';
                    } else if (banner.glow_class === 'glow-orange') {
                        shape1Bg = 'var(--secondary-light)';
                        shape2Bg = 'var(--primary-light)';
                    }

                    // Build slide HTML
                    const slideDiv = document.createElement('div');
                    slideDiv.className = `slide ${idx === 0 ? 'active' : ''}`;
                    slideDiv.setAttribute('data-slide-index', idx);

                    let buttonsHtml = '';
                    if (banner.btn_primary_action) {
                        const primaryText = window.BannerCTA ? window.BannerCTA.getCtaText(banner.btn_primary_action) : 'Learn More';
                        const primaryStyle = banner.btn_primary_style || 'primary';
                        buttonsHtml += `<button data-cta-action="${banner.btn_primary_action}" class="btn btn-${primaryStyle} btn-lg">${primaryText}</button>`;
                    }
                    if (banner.btn_secondary_action) {
                        const secondaryText = window.BannerCTA ? window.BannerCTA.getCtaText(banner.btn_secondary_action) : 'Contact Us';
                        const secondaryStyle = banner.btn_secondary_style || 'outline';
                        buttonsHtml += `<button data-cta-action="${banner.btn_secondary_action}" class="btn btn-${secondaryStyle} btn-lg">${secondaryText}</button>`;
                    }

                    let statsHtml = '';
                    if (banner.stat_1_number && banner.stat_1_label) {
                        statsHtml += `
                            <div class="stat">
                                <span class="stat-number">${banner.stat_1_number}</span>
                                <span class="stat-label">${banner.stat_1_label}</span>
                            </div>
                        `;
                    }
                    if (banner.stat_2_number && banner.stat_2_label) {
                        statsHtml += `
                            <div class="stat">
                                <span class="stat-number">${banner.stat_2_number}</span>
                                <span class="stat-label">${banner.stat_2_label}</span>
                            </div>
                        `;
                    }
                    if (banner.stat_3_number && banner.stat_3_label) {
                        statsHtml += `
                            <div class="stat">
                                <span class="stat-number">${banner.stat_3_number}</span>
                                <span class="stat-label">${banner.stat_3_label}</span>
                            </div>
                        `;
                    }

                    let floatingHtml = '';
                    if (banner.floating_icon) {
                        floatingHtml += `
                            <div class="floating-element float-1">
                                <div class="icon">${banner.floating_icon}</div>
                                <div class="text">
                                    <strong>${banner.floating_title || ''}</strong>
                                    <span>${banner.floating_desc || ''}</span>
                                </div>
                            </div>
                        `;
                    }

                    slideDiv.innerHTML = `
                        <div class="hero-bg-shapes">
                            <div class="shape shape-1" style="background: ${shape1Bg};"></div>
                            <div class="shape shape-2" style="background: ${shape2Bg};"></div>
                        </div>
                        <div class="container hero-container">
                            <div class="hero-content">
                                <div class="badge ${banner.badge_class}">${banner.badge_text}</div>
                                <h1 class="hero-title animate-up">${banner.title}</h1>
                                <p class="hero-subtitle animate-up delay-1">${banner.subtitle}</p>
                                <div class="hero-buttons animate-up delay-2">
                                    ${buttonsHtml}
                                </div>
                                <div class="hero-stats animate-up delay-3">
                                    ${statsHtml}
                                </div>
                            </div>
                            <div class="hero-image-wrapper">
                                <div class="glass-card image-card ${banner.glow_class}">
                                    <img src="${banner.image_path}" alt="${banner.badge_text}" class="hero-img">
                                </div>
                                ${floatingHtml}
                            </div>
                        </div>
                    `;

                    sliderContainer.appendChild(slideDiv);

                    // Build dot HTML
                    const dotSpan = document.createElement('span');
                    dotSpan.className = `dot ${idx === 0 ? 'active' : ''}`;
                    dotSpan.setAttribute('data-slide', idx);
                    sliderDotsContainer.appendChild(dotSpan);
                });

                // Initialize CTA buttons after banners are loaded
                if (window.BannerCTA) {
                    window.BannerCTA.initializeBannerCtas();
                }
            }
        } catch (err) {
            console.warn('⚠️ Dynamic banner loading failed. Using fallback static slides.', err);
        }

        // Query elements after dynamic rendering (or keep existing static elements)
        slides = highlightsSlider.querySelectorAll('.slide');
        dots = highlightsSlider.querySelectorAll('.dot');

        function updateSliderHeight() {
            if (slides.length === 0 || !slides[currentSlide]) return;
            const activeSlide = slides[currentSlide];
            const container = activeSlide.querySelector('.hero-container');
            if (container) {
                const contentHeight = container.offsetHeight;
                const computedStyle = window.getComputedStyle(activeSlide);
                const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
                const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
                const totalHeight = contentHeight + paddingTop + paddingBottom;
                highlightsSlider.style.height = `${totalHeight}px`;
            } else {
                highlightsSlider.style.height = `${activeSlide.offsetHeight}px`;
            }
        }

        function showSlide(index) {
            if (slides.length === 0) return;
            if (index >= slides.length) currentSlide = 0;
            else if (index < 0) currentSlide = slides.length - 1;
            else currentSlide = index;

            // Physically translate the slider track horizontally
            if (sliderContainer) {
                sliderContainer.style.transform = `translateX(-${currentSlide * 100}%)`;
            }

            slides.forEach(slide => slide.classList.remove('active'));
            dots.forEach(dot => dot.classList.remove('active'));

            if (slides[currentSlide]) {
                slides[currentSlide].classList.add('active');
            }
            if (dots[currentSlide]) {
                dots[currentSlide].classList.add('active');
            }

            // Adjust height dynamically to fit current slide
            setTimeout(updateSliderHeight, 50);

            // Log slide change to analytics
            if (window.GM_Analytics) {
                window.GM_Analytics.logEvent('slider_interaction', `view_slide_${currentSlide}`);
            }
        }

        // Handle image loading to size slider correctly when images finish downloading
        highlightsSlider.querySelectorAll('.hero-img').forEach(img => {
            img.addEventListener('load', () => {
                const slide = img.closest('.slide');
                if (slide && slide.classList.contains('active')) {
                    updateSliderHeight();
                }
            });
        });

        // Update slider height on window resize
        window.addEventListener('resize', updateSliderHeight);

        function nextSlide() {
            showSlide(currentSlide + 1);
        }

        function prevSlide() {
            showSlide(currentSlide - 1);
        }

        function startAutoPlay() {
            stopAutoPlay();
            if (slides.length > 0) {
                slideInterval = setInterval(nextSlide, SLIDE_DURATION);
            }
        }

        function stopAutoPlay() {
            if (slideInterval) clearInterval(slideInterval);
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                nextSlide();
                startAutoPlay();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                prevSlide();
                startAutoPlay();
            });
        }

        // Delegation for dots since they might be dynamically rendered
        if (sliderDotsContainer) {
            sliderDotsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('dot')) {
                    const index = parseInt(e.target.getAttribute('data-slide'));
                    showSlide(index);
                    startAutoPlay();
                }
            });
        }

        highlightsSlider.addEventListener('mouseenter', stopAutoPlay);
        highlightsSlider.addEventListener('mouseleave', startAutoPlay);

        // Touch swipe support for mobile devices
        let touchStartX = 0;
        let touchEndX = 0;

        highlightsSlider.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            stopAutoPlay();
        }, { passive: true });

        highlightsSlider.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchEndX - touchStartX;
            if (Math.abs(diff) > 50) {
                if (diff < 0) {
                    nextSlide();
                } else {
                    prevSlide();
                }
            }
            startAutoPlay();
        }, { passive: true });

        if (slides.length > 0) {
            showSlide(0); // Set initial active slide height immediately
            startAutoPlay();
        }
    }

    // FAQ Accordion Toggle
    const faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const faqItem = question.parentElement;
            const answer = question.nextElementSibling;
            const toggleIcon = question.querySelector('.faq-toggle-icon');

            const isActive = faqItem.classList.contains('active');

            // Close other items for a clean single-open accordion feel
            document.querySelectorAll('.faq-item').forEach(item => {
                item.classList.remove('active');
                const itemAnswer = item.querySelector('.faq-answer');
                if (itemAnswer) itemAnswer.style.maxHeight = null;
                const itemIcon = item.querySelector('.faq-toggle-icon');
                if (itemIcon) itemIcon.textContent = '+';
            });

            if (!isActive) {
                faqItem.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + 'px';
                toggleIcon.textContent = '−';
            }
        });
    });

    // ==========================================
    // DYNAMIC SITE SETTINGS (Contact Info)
    // ==========================================
    async function fetchSiteSettings() {
        try {
            const response = await fetch('/api/settings');
            if (!response.ok) return;
            const settings = await response.json();

            // Phone
            const phoneEl = document.getElementById('display-phone');
            const phoneLink = document.getElementById('contact-phone-link');
            if (phoneEl && settings.contact_phone) {
                phoneEl.textContent = settings.contact_phone;
                if (phoneLink) phoneLink.href = 'tel:' + settings.contact_phone.replace(/[\s\-]/g, '');
            }

            // Email
            const emailEl = document.getElementById('display-email');
            const emailLink = document.getElementById('contact-email-link');
            if (emailEl && settings.contact_email) {
                emailEl.textContent = settings.contact_email;
                if (emailLink) emailLink.href = 'mailto:' + settings.contact_email;
            }

            // Location
            const locationEl = document.getElementById('display-location');
            if (locationEl && settings.contact_location) {
                locationEl.textContent = settings.contact_location;
            }
        } catch (err) {
            // Silently fail — hardcoded defaults remain visible
        }
    }
    fetchSiteSettings();
});
