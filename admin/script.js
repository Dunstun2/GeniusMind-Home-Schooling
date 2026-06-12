// Admin Dashboard Client Logic
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    checkAuthentication();

    // DOM Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const pageTitle = document.getElementById('pageTitle');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // State Store
    let bookings = [];
    let charts = {};
    
    // GA-like Analytics State Store
    let gaBreakdowns = {};
    let gaTimeline = {};
    let gaReferrers = [];
    let gaEvents = [];
    let activeGATab = 'devices'; // 'devices' or 'browsers'

    // Tab Navigation Logic
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');
            
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            tabContents.forEach(tab => tab.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
            
            // Set Header Title
            pageTitle.textContent = item.textContent.replace(/[^\w\s]/gi, '').trim();
            
            // Trigger section-specific loads
            if (tabId === 'dashboard') {
                loadDashboardStats();
            } else if (tabId === 'bookings') {
                loadBookings();
            } else if (tabId === 'emails') {
                loadEmails();
            } else if (tabId === 'analytics') {
                loadAnalytics();
            } else if (tabId === 'users') {
                loadAdminUsers();
            } else if (tabId === 'banners') {
                loadBanners();
            }
        });
    });

    // Logout Handler
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/api/admin/logout', { method: 'POST' });
                if (response.ok) {
                    window.location.href = '/admin/login.html';
                }
            } catch (err) {
                console.error('Logout failed:', err);
            }
        });
    }

    // Modal Events
    const emailModal = document.getElementById('emailModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            emailModal.classList.remove('active');
        });
    }
    window.addEventListener('click', (e) => {
        if (e.target === emailModal) {
            emailModal.classList.remove('active');
        }
    });

    // Create Admin User Account Form Submission
    const createAdminForm = document.getElementById('createAdminForm');
    if (createAdminForm) {
        createAdminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('newUsername').value;
            const password = document.getElementById('newPassword').value;
            const submitBtn = createAdminForm.querySelector('.btn-submit-account');
            
            submitBtn.textContent = 'Registering Account...';
            submitBtn.disabled = true;
            
            try {
                const response = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    alert('Success: Administrator account registered successfully.');
                    createAdminForm.reset();
                    loadAdminUsers();
                } else {
                    throw new Error(result.error || 'Failed to create account.');
                }
            } catch (err) {
                alert('Error registering admin: ' + err.message);
            } finally {
                submitBtn.textContent = 'Create Admin Account';
                submitBtn.disabled = false;
            }
        });
    }

    // Collapsible Diagnostic Logs Toggle Setup
    const toggleDiagnosticLogs = document.getElementById('toggleDiagnosticLogs');
    const diagnosticLogsContainer = document.getElementById('diagnosticLogsContainer');
    if (toggleDiagnosticLogs && diagnosticLogsContainer) {
        toggleDiagnosticLogs.addEventListener('click', () => {
            if (diagnosticLogsContainer.style.display === 'none') {
                diagnosticLogsContainer.style.display = 'block';
                toggleDiagnosticLogs.textContent = '⚙️ Hide Diagnostic Activity Logs';
                // Scroll down to logs smoothly
                setTimeout(() => {
                    diagnosticLogsContainer.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            } else {
                diagnosticLogsContainer.style.display = 'none';
                toggleDiagnosticLogs.textContent = '⚙️ Show Diagnostic Activity Logs';
            }
        });
    }

    // Devices & Browsers Tab Switchers inside GA Card
    const gaTabDevicesBtn = document.getElementById('gaTabDevicesBtn');
    const gaTabBrowsersBtn = document.getElementById('gaTabBrowsersBtn');
    
    if (gaTabDevicesBtn && gaTabBrowsersBtn) {
        gaTabDevicesBtn.addEventListener('click', () => {
            gaTabDevicesBtn.classList.add('active');
            gaTabBrowsersBtn.classList.remove('active');
            activeGATab = 'devices';
            renderGATabs();
        });
        
        gaTabBrowsersBtn.addEventListener('click', () => {
            gaTabBrowsersBtn.classList.add('active');
            gaTabDevicesBtn.classList.remove('active');
            activeGATab = 'browsers';
            renderGATabs();
        });
    }

    // Auto-refresh Dashboard Stats every 20 seconds for Real-time GA Tracking
    setInterval(() => {
        const activeTab = document.querySelector('.nav-item.active').getAttribute('data-tab');
        if (activeTab === 'dashboard') {
            loadDashboardStats(true); // pass flag to skip connection alerts
        }
    }, 20000);

    // ==========================================
    // CORE API DATA FETCHERS
    // ==========================================

    async function checkAuthentication() {
        try {
            const response = await fetch('/api/admin/check-session');
            const data = await response.json();
            if (!data.authenticated) {
                window.location.href = '/admin/login.html';
            } else {
                document.getElementById('adminUsername').textContent = data.username || 'admin';
                document.getElementById('userAvatar').textContent = (data.username || 'A').charAt(0).toUpperCase();
                
                // Fetch initial default tab data
                loadDashboardStats();
            }
        } catch (err) {
            console.error('Session check failure:', err);
            window.location.href = '/admin/login.html';
        }
    }

    async function loadDashboardStats(isAutoRefresh = false) {
        try {
            const response = await fetch('/api/admin/stats');
            if (response.status === 401) return window.location.href = '/admin/login.html';
            
            const data = await response.json();
            
            // Inject Stats
            document.getElementById('statBookings').textContent = data.stats.totalBookings;
            document.getElementById('statSessions').textContent = data.stats.totalSessions;
            document.getElementById('statPageviews').textContent = data.stats.totalPageviews;
            document.getElementById('statConversion').textContent = data.stats.conversionRate;
            document.getElementById('statDuration').textContent = data.stats.avgDuration;
            document.getElementById('statBounce').textContent = data.stats.bounceRate;
            
            // Realtime Counter
            document.getElementById('activeUsers').textContent = data.stats.activeUsers;

            // Render Charts
            renderCharts(data.breakdowns, data.timeline);
            
            // Log details on db engine status
            if (!isAutoRefresh) {
                checkDatabaseConnection(data.dbMode);
            }
        } catch (err) {
            console.error('Error fetching dashboard statistics:', err);
        }
    }

    // Dynamic Database Engine Check
    function checkDatabaseConnection(dbMode) {
        const dbText = document.getElementById('dbText');
        const dbIndicator = document.getElementById('dbIndicator');
        
        if (dbMode === 'mysql') {
            dbText.textContent = 'MySQL Mode';
            dbIndicator.className = 'indicator-dot green';
        } else {
            dbText.textContent = 'Memory Fallback';
            dbIndicator.className = 'indicator-dot orange';
        }
    }

    async function loadBookings() {
        try {
            const response = await fetch('/api/admin/bookings');
            if (response.status === 401) return window.location.href = '/admin/login.html';
            
            bookings = await response.json();
            renderBookingsTable();
        } catch (err) {
            console.error('Error fetching bookings:', err);
        }
    }

    async function loadEmails() {
        try {
            const response = await fetch('/api/admin/emails');
            if (response.status === 401) return window.location.href = '/admin/login.html';
            
            const emails = await response.json();
            renderEmailsTable(emails);
        } catch (err) {
            console.error('Error fetching emails:', err);
        }
    }

    async function loadAnalytics() {
        try {
            // 1. Fetch live metrics calculations
            const statsRes = await fetch('/api/admin/stats');
            if (statsRes.status === 401) return window.location.href = '/admin/login.html';
            const statsData = await statsRes.json();
            
            gaBreakdowns = statsData.breakdowns || {};
            gaTimeline = statsData.timeline || {};
            gaReferrers = statsData.topReferrers || [];
            gaEvents = statsData.eventsGA || [];
            
            // 2. Fetch raw sessions & events for diagnostic tables
            const rawRes = await fetch('/api/admin/analytics');
            const rawData = await rawRes.json();
            
            // 3. Render Google Analytics widgets
            renderGAWidgets();
            
            // 4. Render raw logs tables
            renderAnalyticsTables(rawData.sessions, rawData.events);
        } catch (err) {
            console.error('Error fetching analytics:', err);
        }
    }

    async function loadAdminUsers() {
        try {
            const response = await fetch('/api/admin/users');
            if (response.status === 401) return window.location.href = '/admin/login.html';
            
            const users = await response.json();
            renderAdminUsersTable(users);
        } catch (err) {
            console.error('Error fetching admin users:', err);
        }
    }

    // ==========================================
    // UI RENDERING METHODS
    // ==========================================

    // Render Google Analytics Widgets
    function renderGAWidgets() {
        // 1. Render Countries List
        const countriesList = document.getElementById('gaCountriesList');
        countriesList.innerHTML = '';
        const countryData = gaBreakdowns.countries || {};
        const countryNames = Object.keys(countryData);
        let totalCountryVisitors = 0;
        countryNames.forEach(name => totalCountryVisitors += countryData[name].count || 0);
        
        const sortedCountries = countryNames.map(name => countryData[name])
            .sort((a, b) => b.count - a.count);
        
        if (sortedCountries.length === 0) {
            countriesList.innerHTML = `
                <div class="ga-empty-state">
                    <span class="ga-empty-icon">🌍</span>
                    <span class="ga-empty-title">No visitor locations</span>
                    <span class="ga-empty-desc">Country traffic data will appear here once visitors browse your site.</span>
                </div>`;
        } else {
            sortedCountries.forEach(item => {
                const percentage = totalCountryVisitors > 0 ? Math.round((item.count / totalCountryVisitors) * 100) : 0;
                countriesList.innerHTML += `
                    <div class="ga-row">
                        <span class="ga-label-text">
                            <img src="https://flagcdn.com/w20/${item.code}.png" 
                                 srcset="https://flagcdn.com/w40/${item.code}.png 2x" 
                                 width="20" 
                                 alt="${item.name} Flag" 
                                 style="border-radius: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.25); vertical-align: middle; margin-right: 6px;">
                            ${item.name}
                        </span>
                        <div class="ga-bar-wrapper">
                            <div class="ga-bar-fill" style="width: ${percentage}%"></div>
                        </div>
                        <span class="ga-value-text">${percentage}%</span>
                    </div>`;
            });
        }

        // 2. Render Operating Systems List
        const osList = document.getElementById('gaOsList');
        osList.innerHTML = '';
        const osData = gaBreakdowns.osBreakdown || {};
        const osKeys = Object.keys(osData);
        let totalOsVisitors = 0;
        osKeys.forEach(k => totalOsVisitors += osData[k]);
        
        const sortedOs = osKeys.map(k => ({
            name: k,
            count: osData[k]
        })).sort((a, b) => b.count - a.count);
        
        if (sortedOs.length === 0) {
            osList.innerHTML = `
                <div class="ga-empty-state">
                    <span class="ga-empty-icon">🖥️</span>
                    <span class="ga-empty-title">No OS data</span>
                    <span class="ga-empty-desc">Platforms breakdown will appear here.</span>
                </div>`;
        } else {
            sortedOs.forEach(item => {
                const percentage = totalOsVisitors > 0 ? Math.round((item.count / totalOsVisitors) * 100) : 0;
                osList.innerHTML += `
                    <div class="ga-row">
                        <span class="ga-label-text">${item.name}</span>
                        <div class="ga-bar-wrapper">
                            <div class="ga-bar-fill" style="width: ${percentage}%"></div>
                        </div>
                        <span class="ga-value-text">${percentage}%</span>
                    </div>`;
            });
        }

        // 3. Render Referrers List
        const referrersList = document.getElementById('gaReferrersList');
        referrersList.innerHTML = '';
        let totalReferrerVisitors = 0;
        gaReferrers.forEach(r => totalReferrerVisitors += r.count);
        
        if (gaReferrers.length === 0) {
            referrersList.innerHTML = `
                <div class="ga-empty-state">
                    <span class="ga-empty-icon">🔗</span>
                    <span class="ga-empty-title">No referrals</span>
                    <span class="ga-empty-desc">Referrer websites will appear here.</span>
                </div>`;
        } else {
            gaReferrers.forEach(r => {
                const percentage = totalReferrerVisitors > 0 ? Math.round((r.count / totalReferrerVisitors) * 100) : 0;
                referrersList.innerHTML += `
                    <div class="ga-row">
                        <span class="ga-label-text" title="${r.name}">${r.name}</span>
                        <div class="ga-bar-wrapper">
                            <div class="ga-bar-fill" style="width: ${percentage}%"></div>
                        </div>
                        <span class="ga-value-text">${percentage}%</span>
                    </div>`;
            });
        }

        // 4. Render Devices vs Browsers Tabs
        renderGATabs();

        // 5. Render Events GA List (Matching GA table list or showing the beautiful empty state)
        const eventsList = document.getElementById('gaEventsList');
        eventsList.innerHTML = '';
        
        if (gaEvents.length === 0) {
            eventsList.innerHTML = `
                <div class="ga-empty-state" style="padding: 40px 20px;">
                    <div class="ga-empty-icon">⚡</div>
                    <div class="ga-empty-title">No custom events</div>
                    <div class="ga-empty-desc">Set up custom events to gain a deeper understanding of user behavior on your site.</div>
                </div>`;
        } else {
            gaEvents.forEach(e => {
                eventsList.innerHTML += `
                    <div class="ga-row event-row">
                        <span class="ga-label-text" title="${e.name}">
                            <span style="font-size: 11px; opacity: 0.65; margin-right: 4px;">⚡</span> ${e.name}
                        </span>
                        <span class="ga-col-val" style="margin-left: auto; padding-right: 20px;">${e.visitors}</span>
                        <span class="ga-col-val">${e.total}</span>
                    </div>`;
            });
        }
    }

    function renderGATabs() {
        const listContainer = document.getElementById('gaDevicesBrowsersList');
        listContainer.innerHTML = '';
        
        if (activeGATab === 'devices') {
            const deviceData = gaBreakdowns.devices || {};
            const deviceKeys = Object.keys(deviceData);
            let totalDevices = 0;
            deviceKeys.forEach(k => totalDevices += deviceData[k]);
            
            const sortedDevices = deviceKeys.map(k => ({
                name: k,
                count: deviceData[k]
            })).sort((a, b) => b.count - a.count);
            
            if (sortedDevices.length === 0) {
                listContainer.innerHTML = `
                    <div class="ga-empty-state">
                        <span class="ga-empty-icon">📱</span>
                        <span class="ga-empty-title">No devices data</span>
                    </div>`;
            } else {
                sortedDevices.forEach(item => {
                    const percentage = totalDevices > 0 ? Math.round((item.count / totalDevices) * 100) : 0;
                    listContainer.innerHTML += `
                        <div class="ga-row">
                            <span class="ga-label-text">${item.name}</span>
                            <div class="ga-bar-wrapper">
                                <div class="ga-bar-fill" style="width: ${percentage}%"></div>
                            </div>
                            <span class="ga-value-text">${percentage}%</span>
                        </div>`;
                });
            }
        } else {
            const browserData = gaBreakdowns.browsers || {};
            const browserKeys = Object.keys(browserData);
            let totalBrowsers = 0;
            browserKeys.forEach(k => totalBrowsers += browserData[k]);
            
            const sortedBrowsers = browserKeys.map(k => ({
                name: k,
                count: browserData[k]
            })).sort((a, b) => b.count - a.count);
            
            if (sortedBrowsers.length === 0) {
                listContainer.innerHTML = `
                    <div class="ga-empty-state">
                        <span class="ga-empty-icon">🌐</span>
                        <span class="ga-empty-title">No browsers data</span>
                    </div>`;
            } else {
                sortedBrowsers.forEach(item => {
                    const percentage = totalBrowsers > 0 ? Math.round((item.count / totalBrowsers) * 100) : 0;
                    listContainer.innerHTML += `
                        <div class="ga-row">
                            <span class="ga-label-text">${item.name}</span>
                            <div class="ga-bar-wrapper">
                                <div class="ga-bar-fill" style="width: ${percentage}%"></div>
                            </div>
                            <span class="ga-value-text">${percentage}%</span>
                        </div>`;
                });
            }
        }
    }

    // Chart.js Chart Builders
    function renderCharts(breakdowns, timeline) {
        // Destroy existing instances if navigating back to clear memory leaks
        if (charts.timeline) charts.timeline.destroy();
        if (charts.services) charts.services.destroy();
        if (charts.browsers) charts.browsers.destroy();
        if (charts.devices) charts.devices.destroy();

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#9ca3af',
                        font: { family: 'Outfit', size: 11 }
                    }
                }
            }
        };

        // 0. Timeline Chart (Line Chart for GA Pageviews & Sessions)
        const timelineCtx = document.getElementById('timelineChart').getContext('2d');
        const timelineData = timeline || {};
        const timelineLabels = Object.keys(timelineData);
        const pageviewTimelineValues = timelineLabels.map(k => timelineData[k].pageviews);
        const sessionTimelineValues = timelineLabels.map(k => timelineData[k].sessions);

        charts.timeline = new Chart(timelineCtx, {
            type: 'line',
            data: {
                labels: timelineLabels,
                datasets: [
                    {
                        label: 'Pageviews',
                        data: pageviewTimelineValues,
                        borderColor: '#ec4899',
                        backgroundColor: 'rgba(236, 72, 153, 0.08)',
                        tension: 0.35,
                        fill: true,
                        pointBackgroundColor: '#ec4899',
                        borderWidth: 2
                    },
                    {
                        label: 'Unique Sessions',
                        data: sessionTimelineValues,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.08)',
                        tension: 0.35,
                        fill: true,
                        pointBackgroundColor: '#6366f1',
                        borderWidth: 2
                    }
                ]
            },
            options: {
                ...chartOptions,
                plugins: {
                    ...chartOptions.plugins,
                    legend: {
                        position: 'top',
                        labels: { color: '#9ca3af', font: { family: 'Outfit', size: 11 } }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 }, precision: 0 }
                    }
                }
            }
        });

        // 1. Services Chart
        const servicesCtx = document.getElementById('servicesChart').getContext('2d');
        const servicesData = breakdowns.services || {};
        const serviceKeys = Object.keys(servicesData);
        const serviceValues = Object.values(servicesData);

        // Map short service keys to full titles
        const serviceLabels = serviceKeys.map(k => {
            if (k === 'online') return 'Online Teaching';
            if (k === 'home') return 'Home-Based Tutoring';
            if (k === 'physical') return 'Physical Center';
            return k;
        });

        charts.services = new Chart(servicesCtx, {
            type: 'doughnut',
            data: {
                labels: serviceLabels.length > 0 ? serviceLabels : ['No Bookings Yet'],
                datasets: [{
                    data: serviceValues.length > 0 ? serviceValues : [1],
                    backgroundColor: serviceValues.length > 0 ? ['#6366f1', '#ec4899', '#3b82f6'] : ['rgba(255,255,255,0.05)'],
                    borderWidth: 0
                }]
            },
            options: chartOptions
        });

        // 2. Browsers Chart
        const browsersCtx = document.getElementById('browsersChart').getContext('2d');
        const browsersData = breakdowns.browsers || {};
        const browserKeys = Object.keys(browsersData);
        const browserValues = Object.values(browsersData);

        charts.browsers = new Chart(browsersCtx, {
            type: 'polarArea',
            data: {
                labels: browserKeys.length > 0 ? browserKeys : ['No Visitors'],
                datasets: [{
                    data: browserValues.length > 0 ? browserValues : [1],
                    backgroundColor: browserValues.length > 0 ? [
                        'rgba(99, 102, 241, 0.65)', 
                        'rgba(236, 72, 153, 0.65)', 
                        'rgba(59, 130, 246, 0.65)',
                        'rgba(234, 179, 8, 0.65)'
                    ] : ['rgba(255,255,255,0.05)'],
                    borderWidth: 0
                }]
            },
            options: {
                ...chartOptions,
                scales: {
                    r: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { display: false }
                    }
                }
            }
        });

        // 3. Devices Chart (Bar)
        const devicesCtx = document.getElementById('devicesChart').getContext('2d');
        const osData = breakdowns.osBreakdown || {};
        const osKeys = Object.keys(osData);
        const osValues = Object.values(osData);

        charts.devices = new Chart(devicesCtx, {
            type: 'bar',
            data: {
                labels: osKeys.length > 0 ? osKeys : ['No Visitors'],
                datasets: [{
                    label: 'Visitor OS Count',
                    data: osValues.length > 0 ? osValues : [0],
                    backgroundColor: 'rgba(99, 102, 241, 0.7)',
                    borderRadius: 6
                }]
            },
            options: {
                ...chartOptions,
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#9ca3af', font: { family: 'Inter' } }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#9ca3af', font: { family: 'Inter' }, precision: 0 }
                    }
                }
            }
        });
    }

    // Render Bookings with filters and search
    function renderBookingsTable() {
        const tbody = document.getElementById('bookingsTableBody');
        const searchTerm = document.getElementById('bookingSearch').value.toLowerCase();
        const filterVal = document.getElementById('bookingFilter').value;
        
        tbody.innerHTML = '';
        
        const filtered = bookings.filter(b => {
            const matchesSearch = b.name.toLowerCase().includes(searchTerm) || 
                                  b.email.toLowerCase().includes(searchTerm) || 
                                  b.phone.toLowerCase().includes(searchTerm) || 
                                  (b.message && b.message.toLowerCase().includes(searchTerm));
            
            const matchesFilter = filterVal === 'all' || b.status === filterVal;
            
            return matchesSearch && matchesFilter;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center">No bookings found.</td></tr>`;
            return;
        }

        filtered.forEach(b => {
            const tr = document.createElement('tr');
            
            // Format preferred service labels
            let serviceLabel = b.service;
            if (b.service === 'online') serviceLabel = '🌐 Online Learning';
            else if (b.service === 'home') serviceLabel = '🏠 Home Tutoring';
            else if (b.service === 'physical') serviceLabel = '🏢 Center Location';
            
            tr.innerHTML = `
                <td>
                    <div class="user-cell">
                        <strong>${escapeHTML(b.name)}</strong>
                        <span>ID: #${b.id}</span>
                    </div>
                </td>
                <td>
                    <div class="user-cell">
                        <strong>${escapeHTML(b.email)}</strong>
                        <span>${escapeHTML(b.phone)}</span>
                    </div>
                </td>
                <td>${serviceLabel}</td>
                <td><small>${escapeHTML(b.message || 'No additional notes')}</small></td>
                <td>${formatDate(b.created_at)}</td>
                <td>
                    <select class="select-status ${b.status}" data-id="${b.id}">
                        <option value="pending" ${b.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="contacted" ${b.status === 'contacted' ? 'selected' : ''}>Contacted</option>
                        <option value="completed" ${b.status === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="cancelled" ${b.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
            `;

            // Change status action listener
            const select = tr.querySelector('.select-status');
            select.addEventListener('change', async (e) => {
                const newStatus = e.target.value;
                const bookingId = e.target.getAttribute('data-id');
                
                try {
                    const response = await fetch(`/api/admin/bookings/${bookingId}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ status: newStatus })
                    });
                    
                    if (response.ok) {
                        // Update local list state & reapply classes
                        const booking = bookings.find(item => item.id == bookingId);
                        if (booking) booking.status = newStatus;
                        
                        select.className = `select-status ${newStatus}`;
                    } else {
                        throw new Error('Failed to update status.');
                    }
                } catch (err) {
                    alert('Error updating status: ' + err.message);
                    // Reset to old value
                    loadBookings();
                }
            });

            tbody.appendChild(tr);
        });
    }

    // Set search box listeners
    document.getElementById('bookingSearch').addEventListener('input', renderBookingsTable);
    document.getElementById('bookingFilter').addEventListener('change', renderBookingsTable);

    // Render Emails
    function renderEmailsTable(emails) {
        const tbody = document.getElementById('emailsTableBody');
        tbody.innerHTML = '';
        
        if (emails.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center">No emails sent yet.</td></tr>`;
            return;
        }

        emails.forEach(e => {
            const tr = document.createElement('tr');
            
            let statusClass = 'pending';
            if (e.status === 'sent') statusClass = 'completed';
            if (e.status === 'failed') statusClass = 'cancelled';
            
            tr.innerHTML = `
                <td>#${e.id}</td>
                <td>#${e.booking_id || 'N/A'}</td>
                <td><strong>${escapeHTML(e.recipient)}</strong></td>
                <td>${escapeHTML(e.subject)}</td>
                <td><span class="status-badge ${statusClass}">${e.status}</span></td>
                <td>${formatDate(e.created_at)}</td>
                <td>
                    <button class="btn-view-log" data-id="${e.id}">View Content</button>
                </td>
            `;

            // Setup view action
            tr.querySelector('.btn-view-log').addEventListener('click', () => {
                const modalContent = document.getElementById('modalContent');
                
                modalContent.innerHTML = `
                    <p><strong>To:</strong> ${escapeHTML(e.recipient)}</p>
                    <p><strong>Subject:</strong> ${escapeHTML(e.subject)}</p>
                    <p><strong>Status:</strong> <span class="status-badge ${statusClass}">${e.status}</span></p>
                    <p><strong>Sent Date:</strong> ${formatDate(e.created_at)}</p>
                    ${e.error_message ? `<p style="color: #ef4444;"><strong>Error:</strong> ${escapeHTML(e.error_message)}</p>` : ''}
                    <hr style="border-color: var(--border-color); margin: 16px 0;">
                    <blockquote>${e.body}</blockquote>
                `;
                
                emailModal.classList.add('active');
            });

            tbody.appendChild(tr);
        });
    }

    // Render raw visitor session analytics
    function renderAnalyticsTables(sessions, events) {
        const sessionTbody = document.getElementById('sessionsTableBody');
        const eventsTbody = document.getElementById('eventsTableBody');
        
        sessionTbody.innerHTML = '';
        eventsTbody.innerHTML = '';
        
        // 1. Session Table
        if (sessions.length === 0) {
            sessionTbody.innerHTML = `<tr><td colspan="4" class="text-center">No sessions recorded yet.</td></tr>`;
        } else {
            sessions.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><code>${s.session_key.substring(0, 10)}...</code></td>
                    <td>
                        <div class="user-cell">
                            <strong>${escapeHTML(s.browser)} (${escapeHTML(s.device)})</strong>
                            <span>OS: ${escapeHTML(s.os)}</span>
                        </div>
                    </td>
                    <td><small>${escapeHTML(s.referrer)}</small></td>
                    <td>${formatDate(s.created_at)}</td>
                `;
                sessionTbody.appendChild(tr);
            });
        }

        // 2. Events Log
        if (events.length === 0) {
            eventsTbody.innerHTML = `<tr><td colspan="4" class="text-center">No interactive events logged yet.</td></tr>`;
        } else {
            events.slice(0, 50).forEach(e => { // Limit to recent 50
                const tr = document.createElement('tr');
                
                let dataDisplay = '';
                if (e.event_data) {
                    try {
                        const parsed = typeof e.event_data === 'string' ? JSON.parse(e.event_data) : e.event_data;
                        dataDisplay = JSON.stringify(parsed);
                    } catch(ex) {
                        dataDisplay = e.event_data;
                    }
                }
                
                tr.innerHTML = `
                    <td>${formatTime(e.created_at)}</td>
                    <td><code>${escapeHTML(e.event_type)}</code></td>
                    <td><strong>${escapeHTML(e.event_name)}</strong></td>
                    <td><code style="font-size: 11px;">${escapeHTML(dataDisplay)}</code></td>
                `;
                eventsTbody.appendChild(tr);
            });
        }
    }

    // Render Admin Accounts
    function renderAdminUsersTable(users) {
        const tbody = document.getElementById('adminsTableBody');
        tbody.innerHTML = '';
        
        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" class="text-center">No admins found.</td></tr>`;
            return;
        }

        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${escapeHTML(u.username)}</strong></td>
                <td>${formatDate(u.created_at)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // ==========================================
    // UTILITY METHODS
    // ==========================================

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        }) + ' ' + d.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: true 
        });
    }

    function formatTime(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            hour12: true 
        });
    }

    // ==========================================
    // HIGHLIGHTS BANNERS CRUD WORKFLOWS
    // ==========================================
    const bannerModal = document.getElementById('bannerModal');
    const bannerForm = document.getElementById('bannerForm');
    const bannerModalTitle = document.getElementById('bannerModalTitle');
    const addBannerBtn = document.getElementById('addBannerBtn');
    const bannerModalCloseBtn = document.getElementById('bannerModalCloseBtn');
    const bannerCancelBtn = document.getElementById('bannerCancelBtn');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const imageHelp = document.getElementById('imageHelp');
    const imageInput = document.getElementById('image');

    let allBanners = [];

    if (addBannerBtn) {
        addBannerBtn.addEventListener('click', () => {
            openBannerModal();
        });
    }

    if (bannerModalCloseBtn) {
        bannerModalCloseBtn.addEventListener('click', () => {
            closeBannerModal();
        });
    }

    if (bannerCancelBtn) {
        bannerCancelBtn.addEventListener('click', () => {
            closeBannerModal();
        });
    }

    // Modal backdrop click
    window.addEventListener('click', (e) => {
        if (e.target === bannerModal) {
            closeBannerModal();
        }
    });

    function formatDateForLocalInput(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    function openBannerModal(banner = null) {
        bannerForm.reset();
        
        if (banner) {
            // Edit mode
            bannerModalTitle.textContent = 'Edit Highlights Banner';
            document.getElementById('bannerId').value = banner.id;
            document.getElementById('badge_text').value = banner.badge_text || '';
            document.getElementById('badge_class').value = banner.badge_class || 'event-badge';
            document.getElementById('title').value = banner.title || '';
            document.getElementById('subtitle').value = banner.subtitle || '';
            document.getElementById('btn_primary_text').value = banner.btn_primary_text || '';
            document.getElementById('btn_primary_link').value = banner.btn_primary_link || '';
            document.getElementById('btn_secondary_text').value = banner.btn_secondary_text || '';
            document.getElementById('btn_secondary_link').value = banner.btn_secondary_link || '';
            document.getElementById('stat_1_number').value = banner.stat_1_number || '';
            document.getElementById('stat_1_label').value = banner.stat_1_label || '';
            document.getElementById('stat_2_number').value = banner.stat_2_number || '';
            document.getElementById('stat_2_label').value = banner.stat_2_label || '';
            document.getElementById('stat_3_number').value = banner.stat_3_number || '';
            document.getElementById('stat_3_label').value = banner.stat_3_label || '';
            document.getElementById('floating_icon').value = banner.floating_icon || '';
            document.getElementById('floating_title').value = banner.floating_title || '';
            document.getElementById('floating_desc').value = banner.floating_desc || '';
            document.getElementById('glow_class').value = banner.glow_class || 'glow-purple';
            document.getElementById('sort_order').value = banner.sort_order || 0;
            document.getElementById('is_active').value = banner.is_active !== undefined ? banner.is_active : 1;
            document.getElementById('start_date').value = formatDateForLocalInput(banner.start_date);
            document.getElementById('end_date').value = formatDateForLocalInput(banner.end_date);
            
            imageInput.required = false;
            imageHelp.textContent = 'Leave empty to keep current image.';
            
            if (banner.image_path) {
                imagePreview.src = banner.image_path.startsWith('/') ? banner.image_path : '/' + banner.image_path;
                imagePreviewContainer.style.display = 'block';
            } else {
                imagePreviewContainer.style.display = 'none';
            }
        } else {
            // Create mode
            bannerModalTitle.textContent = 'Add Highlights Banner';
            document.getElementById('bannerId').value = '';
            document.getElementById('is_active').value = 1;
            document.getElementById('start_date').value = '';
            document.getElementById('end_date').value = '';
            imageInput.required = true;
            imageHelp.textContent = 'Required. Image will be auto-processed to WebP format.';
            imagePreviewContainer.style.display = 'none';
        }
        
        bannerModal.classList.add('active');
    }

    function closeBannerModal() {
        bannerModal.classList.remove('active');
        bannerForm.reset();
    }

    // Handle Form Submit
    if (bannerForm) {
        bannerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const bannerId = document.getElementById('bannerId').value;
            const submitBtn = document.getElementById('bannerSubmitBtn');
            const isEdit = !!bannerId;
            
            const url = isEdit ? `/api/admin/banners/${bannerId}` : '/api/admin/banners';
            const method = isEdit ? 'PUT' : 'POST';
            
            submitBtn.disabled = true;
            submitBtn.textContent = isEdit ? 'Updating Banner...' : 'Creating Banner...';
            
            try {
                const formData = new FormData(bannerForm);
                
                // If it is PUT, standard method override or send as POST with custom headers is not needed since express parses it,
                // but let's send it as a direct PUT/POST fetch.
                const response = await fetch(url, {
                    method: method,
                    body: formData
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    alert(isEdit ? 'Banner updated successfully.' : 'New banner created successfully.');
                    closeBannerModal();
                    loadBanners();
                } else {
                    throw new Error(result.error || 'Failed to save banner.');
                }
            } catch (err) {
                alert('Error saving banner: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Banner';
            }
        });
    }

    // Fetch and Load Banners
    async function loadBanners() {
        const grid = document.getElementById('bannersGrid');
        if (!grid) return;
        
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Loading highlights banners...</div>';
        
        try {
            const response = await fetch('/api/admin/banners');
            if (response.status === 401) return window.location.href = '/admin/login.html';
            
            allBanners = await response.json();
            renderBannersGrid(allBanners);
        } catch (err) {
            console.error('Error fetching admin banners:', err);
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">Failed to load banners. Please try again.</div>';
        }
    }
    window.loadBanners = loadBanners; // expose globally if needed

    function renderBannersGrid(banners) {
        const grid = document.getElementById('bannersGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        if (banners.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);"><span style="font-size: 40px; display: block; margin-bottom: 15px;">🖼️</span>No banners added yet. Click "Add New Banner" to get started.</div>';
            return;
        }
        
        banners.forEach(banner => {
            const card = document.createElement('div');
            card.className = 'banner-card';
            
            // Build stats list inside the card if present
            let statsHtml = '';
            if (banner.stat_1_number || banner.stat_2_number || banner.stat_3_number) {
                statsHtml += '<div class="banner-card-stats">';
                if (banner.stat_1_number) {
                    statsHtml += `
                        <div class="banner-card-stat">
                            <span class="banner-card-stat-num">${escapeHTML(banner.stat_1_number)}</span>
                            <span class="banner-card-stat-lbl">${escapeHTML(banner.stat_1_label || '')}</span>
                        </div>
                    `;
                }
                if (banner.stat_2_number) {
                    statsHtml += `
                        <div class="banner-card-stat">
                            <span class="banner-card-stat-num">${escapeHTML(banner.stat_2_number)}</span>
                            <span class="banner-card-stat-lbl">${escapeHTML(banner.stat_2_label || '')}</span>
                        </div>
                    `;
                }
                if (banner.stat_3_number) {
                    statsHtml += `
                        <div class="banner-card-stat">
                            <span class="banner-card-stat-num">${escapeHTML(banner.stat_3_number)}</span>
                            <span class="banner-card-stat-lbl">${escapeHTML(banner.stat_3_label || '')}</span>
                        </div>
                    `;
                }
                statsHtml += '</div>';
            }

            const imgPath = banner.image_path.startsWith('/') ? banner.image_path : '/' + banner.image_path;

            // Compute scheduling details
            const now = new Date();
            let schedLabel = 'Live';
            let schedClass = 'completed';
            
            const isActive = banner.is_active === undefined || banner.is_active == 1;
            
            if (!isActive) {
                schedLabel = 'Inactive';
                schedClass = 'cancelled';
            } else {
                const startDate = banner.start_date ? new Date(banner.start_date) : null;
                const endDate = banner.end_date ? new Date(banner.end_date) : null;
                
                if (startDate && now < startDate) {
                    schedLabel = 'Scheduled';
                    schedClass = 'pending';
                } else if (endDate && now > endDate) {
                    schedLabel = 'Expired';
                    schedClass = 'cancelled';
                }
            }

            let scheduleRangeHtml = '';
            if (banner.start_date || banner.end_date) {
                const startStr = banner.start_date ? new Date(banner.start_date).toLocaleString() : 'Immediate';
                const endStr = banner.end_date ? new Date(banner.end_date).toLocaleString() : 'Indefinite';
                scheduleRangeHtml = `
                    <div class="banner-card-schedule" style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px; background: rgba(255,255,255,0.02); padding: 8px 10px; border-radius: 6px; border: 1px dashed var(--border-color); display: flex; flex-direction: column; gap: 2px;">
                        <div><strong>Start:</strong> ${escapeHTML(startStr)}</div>
                        <div><strong>End:</strong> ${escapeHTML(endStr)}</div>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="banner-card-img-wrapper ${!isActive ? 'banner-card-dim' : ''}">
                    <img src="${imgPath}" alt="${escapeHTML(banner.badge_text)}" class="banner-card-img">
                    <span class="status-badge ${banner.badge_class} banner-card-badge">${escapeHTML(banner.badge_text)}</span>
                    <span class="banner-card-order">Order: ${banner.sort_order}</span>
                    <div class="banner-card-glow"></div>
                </div>
                <div class="banner-card-body">
                    <div class="banner-card-meta" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <span class="status-badge ${schedClass}" style="font-size: 12px; font-weight: 700; letter-spacing: 0.3px;">${isActive ? '🟢' : '🔴'} ${schedLabel}</span>
                        <button class="toggle-banner-btn" data-id="${banner.id}" data-active="${banner.is_active}" title="${isActive ? 'Click to Hide this banner on the website' : 'Click to Show this banner on the website'}" style="
                            background: ${isActive ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)'};
                            border: 1px solid ${isActive ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)'};
                            color: ${isActive ? '#ef4444' : '#10b981'};
                            border-radius: 20px;
                            padding: 4px 12px;
                            font-size: 12px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.2s;
                            white-space: nowrap;
                        ">${isActive ? '🙈 Hide' : '👁 Show'}</button>
                    </div>
                    <h4 class="banner-card-title">${banner.title}</h4>
                    <p class="banner-card-subtitle">${escapeHTML(banner.subtitle)}</p>
                    ${scheduleRangeHtml}
                    ${statsHtml}
                    <div class="banner-card-actions">
                        <button class="btn btn-view-log edit-banner-btn" data-id="${banner.id}">✏️ Edit</button>
                        <button class="btn btn-danger delete-banner-btn" data-id="${banner.id}">🗑️ Delete</button>
                    </div>
                </div>
            `;
            
            grid.appendChild(card);
        });

        // Add Event Listeners for actions
        grid.querySelectorAll('.edit-banner-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const banner = allBanners.find(b => b.id == id);
                if (banner) {
                    openBannerModal(banner);
                }
            });
        });

        // Toggle Show/Hide quick action
        grid.querySelectorAll('.toggle-banner-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const isCurrentlyActive = btn.getAttribute('data-active') == 1;
                const label = isCurrentlyActive ? 'hide' : 'show';

                btn.disabled = true;
                btn.textContent = '⏳ Updating...';

                try {
                    const response = await fetch(`/api/admin/banners/${id}/toggle`, { method: 'PATCH' });
                    const result = await response.json();

                    if (response.ok && result.success) {
                        // Update the local allBanners state and re-render
                        const bannerIndex = allBanners.findIndex(b => b.id == id);
                        if (bannerIndex !== -1) {
                            allBanners[bannerIndex].is_active = result.is_active;
                        }
                        renderBannersGrid(allBanners);
                    } else {
                        alert('Error: ' + (result.error || 'Could not toggle visibility.'));
                        btn.disabled = false;
                        btn.textContent = isCurrentlyActive ? '🙈 Hide' : '👁 Show';
                    }
                } catch (err) {
                    alert('Network error: ' + err.message);
                    btn.disabled = false;
                    btn.textContent = isCurrentlyActive ? '🙈 Hide' : '👁 Show';
                }
            });
        });

        grid.querySelectorAll('.delete-banner-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (confirm('Are you sure you want to delete this highlights banner? This action cannot be undone.')) {
                    try {
                        const response = await fetch(`/api/admin/banners/${id}`, {
                            method: 'DELETE'
                        });
                        
                        const result = await response.json();
                        if (response.ok && result.success) {
                            alert('Banner deleted successfully.');
                            loadBanners();
                        } else {
                            throw new Error(result.error || 'Failed to delete banner.');
                        }
                    } catch (err) {
                        alert('Error deleting banner: ' + err.message);
                    }
                }
            });
        });
    }
});
