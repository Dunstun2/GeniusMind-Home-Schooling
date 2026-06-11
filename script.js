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
    // Achievements & Events Highlights Slider Controllers
    // ==========================================================================
    const slides = document.querySelectorAll('.highlights-slider .slide');
    const dots = document.querySelectorAll('.highlights-slider .dot');
    const prevBtn = document.querySelector('.highlights-slider .prev-btn');
    const nextBtn = document.querySelector('.highlights-slider .next-btn');
    const highlightsSlider = document.querySelector('.highlights-slider');
    const sliderContainer = document.querySelector('.highlights-slider .slider-container');
    
    let currentSlide = 0;
    let slideInterval;
    const SLIDE_DURATION = 12000; // 12 seconds per slide
    
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
    
    dots.forEach(dot => {
        dot.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-slide'));
            showSlide(index);
            startAutoPlay();
        });
    });
    
    if (highlightsSlider) {
        highlightsSlider.addEventListener('mouseenter', stopAutoPlay);
        highlightsSlider.addEventListener('mouseleave', startAutoPlay);
    }
    
    if (slides.length > 0) {
        startAutoPlay();
    }
});
