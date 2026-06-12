document.addEventListener('DOMContentLoaded', () => {
    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;
    
    // Check for saved theme preference or OS preference
    const savedTheme = localStorage.getItem('theme');
    const osPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && osPrefersDark)) {
        htmlElement.setAttribute('data-theme', 'dark');
    }

    themeToggle.addEventListener('click', () => {
        if (htmlElement.getAttribute('data-theme') === 'dark') {
            htmlElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            htmlElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
    });

    // Mobile Menu Toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // Close mobile menu when a link is clicked
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
        });
    });

    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Set current year in footer
    document.getElementById('year').textContent = new Date().getFullYear();

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
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - navHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

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
});
