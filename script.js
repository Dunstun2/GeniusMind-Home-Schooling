// Utility helper to escape HTML and prevent XSS
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load Navbar and Footer Components first
    await loadComponents();

    // 2. Initialize Shared UI listeners (Theme, Mobile Menu, Year, etc.)
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
            if (navLinks) navLinks.classList.remove('active');
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

        // Mobile Menu Toggle
        const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
        const navLinks = document.querySelector('.nav-links');

        if (mobileMenuBtn && navLinks) {
            mobileMenuBtn.addEventListener('click', () => {
                navLinks.classList.toggle('active');
            });
        }

        // Close mobile menu when nav link is clicked
        const links = document.querySelectorAll('.nav-links a');
        links.forEach(link => {
            link.addEventListener('click', () => {
                if (navLinks) navLinks.classList.remove('active');
            });
        });

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
                    if (banner.btn_primary_text) {
                        buttonsHtml += `<a href="${banner.btn_primary_link || '#'}" class="btn btn-primary btn-lg">${banner.btn_primary_text}</a>`;
                    }
                    if (banner.btn_secondary_text) {
                        buttonsHtml += `<a href="${banner.btn_secondary_link || '#'}" class="btn btn-outline btn-lg">${banner.btn_secondary_text}</a>`;
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
            }
        } catch (err) {
            console.warn('⚠️ Dynamic banner loading failed. Using fallback static slides.', err);
        }
        
        // Query elements after dynamic rendering (or keep existing static elements)
        slides = highlightsSlider.querySelectorAll('.slide');
        dots = highlightsSlider.querySelectorAll('.dot');
        
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
            
            // Log slide change to analytics
            if (window.GM_Analytics) {
                window.GM_Analytics.logEvent('slider_interaction', `view_slide_${currentSlide}`);
            }
        }
        
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
        
        if (slides.length > 0) {
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
