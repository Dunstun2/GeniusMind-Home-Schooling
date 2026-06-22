// Admin Dashboard Client Logic
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    checkAuthentication();

    // Initialize Mailbox System
    initMailboxEvents();

    // DOM Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const pageTitle = document.getElementById('pageTitle');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // State Store
    let bookings = [];
    let charts = {};
    
    // Mailbox State
    let mailboxFolder = 'inbox';
    let mailboxEmails = [];
    let selectedMailId = null;
    
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
            loadWhatsAppStatus();
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
                loadWhatsAppStatus();
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

    let waStatusPollTimeout = null;

    async function loadWhatsAppStatus() {
        if (waStatusPollTimeout) {
            clearTimeout(waStatusPollTimeout);
            waStatusPollTimeout = null;
        }

        try {
            const response = await fetch('/api/admin/whatsapp/status');
            if (response.ok) {
                const data = await response.json();
                const statusText = document.getElementById('waStatusText');
                const qrContainer = document.getElementById('waQrContainer');
                const qrImage = document.getElementById('waQrImage');
                const disconnectBtn = document.getElementById('waDisconnectBtn');
                
                if (!statusText) return; // Not on dashboard
                
                let shouldPollFast = false;
                
                if (data.status === 'ready') {
                    statusText.textContent = 'Connected ✅';
                    statusText.style.color = '#25D366';
                    qrContainer.style.display = 'none';
                    if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
                } else if (data.status === 'authenticating') {
                    if (data.qrCode) {
                        statusText.textContent = 'Waiting for QR Scan...';
                        statusText.style.color = '#ff9800';
                        qrContainer.style.display = 'block';
                        qrImage.src = data.qrCode;
                    } else {
                        statusText.textContent = 'Generating QR Code...';
                        statusText.style.color = '#ff9800';
                        qrContainer.style.display = 'none';
                        shouldPollFast = true;
                    }
                    if (disconnectBtn) disconnectBtn.style.display = 'none';
                } else if (data.status === 'disconnected') {
                    statusText.textContent = 'Disconnected ⚠️';
                    statusText.style.color = '#f44336';
                    qrContainer.style.display = 'none';
                    if (disconnectBtn) disconnectBtn.style.display = 'none';
                    shouldPollFast = true;
                } else {
                    statusText.textContent = data.status || 'Unknown';
                    statusText.style.color = '#666';
                    if (disconnectBtn) disconnectBtn.style.display = 'none';
                }

                if (shouldPollFast) {
                    waStatusPollTimeout = setTimeout(loadWhatsAppStatus, 2000);
                }
            }
        } catch (err) {
            console.error('Error fetching WhatsApp status:', err);
        }
    }

    // Register WhatsApp disconnect listener
    const waDisconnectBtn = document.getElementById('waDisconnectBtn');
    if (waDisconnectBtn) {
        waDisconnectBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to disconnect WhatsApp integration? You will need to scan the QR code again to reconnect.')) return;
            
            waDisconnectBtn.disabled = true;
            waDisconnectBtn.textContent = 'Disconnecting...';
            
            try {
                const response = await fetch('/api/admin/whatsapp/disconnect', { method: 'POST' });
                if (response.ok) {
                    alert('WhatsApp disconnected successfully.');
                    loadWhatsAppStatus();
                } else {
                    const err = await response.json();
                    alert(err.error || 'Failed to disconnect WhatsApp.');
                }
            } catch (e) {
                alert('Connection error while disconnecting WhatsApp.');
            } finally {
                waDisconnectBtn.disabled = false;
                waDisconnectBtn.textContent = 'Disconnect WhatsApp';
            }
        });
    }

    // Dynamic Database Engine Check
    function checkDatabaseConnection(dbMode) {
        const dbText = document.getElementById('dbText');
        const dbIndicator = document.getElementById('dbIndicator');
        
        if (dbMode === 'sqlite') {
            dbText.textContent = 'SQLite Mode';
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
            const apiPath = mailboxFolder === 'inbox' ? '/api/admin/emails/inbox' : '/api/admin/emails/sent';
            const response = await fetch(apiPath);
            if (response.status === 401) return window.location.href = '/admin/login.html';
            
            mailboxEmails = await response.json();
            renderMailboxList();
            renderMailboxCount();
        } catch (err) {
            console.error('Error fetching mailbox emails:', err);
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
                <td>
                    <button class="btn-chat-booking" data-booking-id="${b.id}" data-booking-name="${escapeHTML(b.name)}">
                        💬 Chat
                    </button>
                </td>
            `;

            // Chat button click
            const chatBtn = tr.querySelector('.btn-chat-booking');
            chatBtn.addEventListener('click', () => {
                openBookingChat(b.id, b.name, b.message);
            });

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
    // Initialize Mailbox UI events
    function initMailboxEvents() {
        // Delegate events on folder switches and buttons
        document.addEventListener('click', (e) => {
            const folderItem = e.target.closest('.folder-item');
            if (folderItem) {
                e.preventDefault();
                document.querySelectorAll('.folder-item').forEach(f => f.classList.remove('active'));
                folderItem.classList.add('active');
                
                mailboxFolder = folderItem.getAttribute('data-folder');
                selectedMailId = null;
                
                const searchInput = document.getElementById('mailboxSearch');
                if (searchInput) searchInput.value = '';
                
                resetMailboxViewPane();
                loadEmails();
            }
            
            if (e.target.closest('#mailboxComposeBtn')) {
                e.preventDefault();
                document.querySelectorAll('.folder-item').forEach(f => f.classList.remove('active'));
                showMailboxComposer();
            }
        });

        // Search inputs
        document.addEventListener('input', (e) => {
            if (e.target && e.target.id === 'mailboxSearch') {
                renderMailboxList();
            }
        });

        // Sync with Gmail
        document.addEventListener('click', async (e) => {
            const syncBtn = e.target.closest('#mailboxSyncBtn');
            if (syncBtn) {
                e.preventDefault();
                if (syncBtn.classList.contains('syncing')) return;
                
                syncBtn.classList.add('syncing');
                syncBtn.disabled = true;
                const syncText = syncBtn.innerHTML;
                syncBtn.innerHTML = '<span class="sync-icon">🔄</span> Syncing...';
                
                try {
                    const response = await fetch('/api/admin/emails/sync');
                    if (response.ok) {
                        const data = await response.json();
                        mailboxEmails = data.emails;
                        renderMailboxList();
                        renderMailboxCount();
                        alert('Gmail inbox synced successfully!');
                    } else {
                        throw new Error('Sync failed.');
                    }
                } catch (err) {
                    alert('Sync failed: ' + err.message);
                } finally {
                    syncBtn.classList.remove('syncing');
                    syncBtn.disabled = false;
                    syncBtn.innerHTML = syncText;
                }
            }
        });
    }

    // Reset view pane to clean slate
    function resetMailboxViewPane() {
        const viewPane = document.getElementById('mailboxViewPane');
        if (viewPane) {
            viewPane.innerHTML = `
                <div class="mailbox-view-empty">
                    <span>📬</span>
                    <p>Select an email to view details or click Compose to write a new message.</p>
                </div>`;
        }
    }

    // Render unread indicator badges
    function renderMailboxCount() {
        const badge = document.getElementById('inboxCount');
        if (!badge) return;
        
        if (mailboxFolder === 'inbox') {
            const readList = getReadEmails();
            const unreadCount = mailboxEmails.filter(e => !readList.includes(e.message_id)).length;
            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    // Get read items from LocalStorage
    function getReadEmails() {
        const read = localStorage.getItem('read_emails');
        return read ? JSON.parse(read) : [];
    }

    // Mark email as read in LocalStorage
    function markEmailAsRead(messageId) {
        const readList = getReadEmails();
        if (!readList.includes(messageId)) {
            readList.push(messageId);
            localStorage.setItem('read_emails', JSON.stringify(readList));
            renderMailboxCount();
            
            const item = document.querySelector(`.mail-item[data-message-id="${messageId}"]`);
            if (item) item.classList.remove('unread');
        }
    }

    // Render list of emails in middle pane
    function renderMailboxList() {
        const listContainer = document.getElementById('mailboxList');
        if (!listContainer) return;
        
        const searchInput = document.getElementById('mailboxSearch');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        
        listContainer.innerHTML = '';
        
        const filtered = mailboxEmails.filter(e => {
            const senderName = e.sender_name || '';
            const senderEmail = e.sender_email || '';
            const recipient = e.recipient || '';
            const subject = e.subject || '';
            const body = e.body || '';
            
            return senderName.toLowerCase().includes(searchTerm) ||
                   senderEmail.toLowerCase().includes(searchTerm) ||
                   recipient.toLowerCase().includes(searchTerm) ||
                   subject.toLowerCase().includes(searchTerm) ||
                   body.toLowerCase().includes(searchTerm);
        });

        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div class="mailbox-empty-state">
                    <span>✉️</span>
                    <p>No emails found in ${mailboxFolder}</p>
                </div>`;
            return;
        }

        const readList = getReadEmails();

        filtered.forEach(email => {
            const item = document.createElement('div');
            item.className = 'mail-item';
            
            const isInbox = mailboxFolder === 'inbox';
            const isUnread = isInbox && !readList.includes(email.message_id);
            if (isUnread) item.classList.add('unread');
            
            if (selectedMailId === email.id) item.classList.add('selected');
            item.setAttribute('data-id', email.id);
            item.setAttribute('data-message-id', email.message_id);
            
            const nameDisplay = isInbox 
                ? (email.sender_name || email.sender_email.split('@')[0]) 
                : `To: ${email.recipient}`;
                
            const dateDisplay = formatDate(email.received_at || email.created_at);
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = email.body || '';
            const plainTextBody = tempDiv.textContent || tempDiv.innerText || '';
            const snippet = plainTextBody.substring(0, 100);

            item.innerHTML = `
                <div class="mail-item-header">
                    <span class="mail-item-sender">${escapeHTML(nameDisplay)}</span>
                    <span class="mail-item-date">${dateDisplay}</span>
                </div>
                <div class="mail-item-subject">${escapeHTML(email.subject || '(No Subject)')}</div>
                <div class="mail-item-snippet">${escapeHTML(snippet)}...</div>
            `;

            item.addEventListener('click', () => {
                document.querySelectorAll('.mail-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                selectedMailId = email.id;
                
                if (isInbox) {
                    markEmailAsRead(email.message_id);
                }
                
                renderMailboxDetail(email);
            });

            listContainer.appendChild(item);
        });
    }

    // Render details of selected email in right pane
    function renderMailboxDetail(email) {
        const viewPane = document.getElementById('mailboxViewPane');
        if (!viewPane) return;
        
        const isInbox = mailboxFolder === 'inbox';
        const senderLabel = isInbox ? 'From' : 'To';
        const senderVal = isInbox 
            ? `${email.sender_name ? `"${email.sender_name}" ` : ''}&lt;${email.sender_email}&gt;`
            : email.recipient;
            
        const dateVal = formatDate(email.received_at || email.created_at);

        viewPane.innerHTML = `
            <div class="mail-view-header">
                <h2 class="mail-view-title">${escapeHTML(email.subject || '(No Subject)')}</h2>
                <div class="mail-view-meta">
                    <div class="mail-view-sender-info">
                        <strong>${senderLabel}:</strong>
                        <span>${senderVal}</span>
                    </div>
                    <div class="mail-view-time-info">
                        <span>${dateVal}</span>
                    </div>
                </div>
            </div>
            <div class="mail-view-body">
                ${email.body || '(No Content)'}
            </div>
            <div class="mail-view-actions">
                ${isInbox ? `<button class="btn btn-reply-mail" id="mailReplyBtn"><span>↩️</span> Reply</button>` : ''}
            </div>
        `;
        
        if (isInbox) {
            document.getElementById('mailReplyBtn').addEventListener('click', () => {
                showMailboxComposer(email.sender_email, `Re: ${email.subject}`);
            });
        }
    }

    // Render empty composer form
    function showMailboxComposer(recipient = '', subject = '') {
        const viewPane = document.getElementById('mailboxViewPane');
        if (!viewPane) return;
        
        viewPane.innerHTML = `
            <form class="mailbox-compose-form" id="mailboxComposeForm">
                <h3>New Message</h3>
                <div class="form-group-glass">
                    <label for="composeTo">To</label>
                    <input type="email" id="composeTo" required placeholder="recipient@example.com" value="${escapeHTML(recipient)}">
                </div>
                <div class="form-group-glass">
                    <label for="composeSubject">Subject</label>
                    <input type="text" id="composeSubject" required placeholder="Enter email subject" value="${escapeHTML(subject)}">
                </div>
                <div class="form-group-glass" style="flex: 1; display: flex; flex-direction: column;">
                    <label for="composeBody">Message</label>
                    <textarea id="composeBody" required placeholder="Write your message here..."></textarea>
                </div>
                <div class="compose-actions">
                    <button type="button" class="btn btn-cancel-compose" id="composeCancelBtn">Cancel</button>
                    <button type="submit" class="btn btn-send-mail">Send Message</button>
                </div>
            </form>
        `;
        
        document.getElementById('composeCancelBtn').addEventListener('click', () => {
            resetMailboxViewPane();
        });
        
        document.getElementById('mailboxComposeForm').addEventListener('submit', sendMailboxEmail);
    }

    // Submit composer values to backend api
    async function sendMailboxEmail(e) {
        e.preventDefault();
        
        const recipient = document.getElementById('composeTo').value;
        const subject = document.getElementById('composeSubject').value;
        const body = document.getElementById('composeBody').value;
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
        
        try {
            const htmlBody = body.replace(/\n/g, '<br>');
            
            const response = await fetch('/api/admin/emails/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ recipient, subject, body: htmlBody })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                alert('Email sent successfully!');
                resetMailboxViewPane();
                
                const sentFolderLink = document.querySelector('.folder-item[data-folder="sent"]');
                if (sentFolderLink) {
                    sentFolderLink.click();
                }
            } else {
                throw new Error(result.error || 'Failed to send email.');
            }
        } catch (err) {
            alert('Failed to send email: ' + err.message);
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
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
    // BOOKING CHAT PANEL LOGIC
    // ==========================================
    
    let activeChatBookingId = null;
    let activeChatBookingNote = null;
    let chatRefreshInterval = null;

    const chatOverlay = document.getElementById('bookingChatOverlay');
    const chatPanelMessages = document.getElementById('chatPanelMessages');
    const chatPanelName = document.getElementById('chatPanelName');
    const chatPanelSubtitle = document.getElementById('chatPanelSubtitle');
    const chatPanelClose = document.getElementById('chatPanelClose');
    const adminChatInput = document.getElementById('adminChatInput');
    const adminChatSendBtn = document.getElementById('adminChatSendBtn');

    // Admin File Attachment variables
    let adminSelectedFile = null;
    const adminChatAttachBtn = document.getElementById('adminChatAttachBtn');
    const adminFileInput = document.getElementById('adminFileInput');
    const adminFilePreviewChip = document.getElementById('adminFilePreviewChip');
    const adminChipName = document.getElementById('adminChipName');
    const adminChipRemove = document.getElementById('adminChipRemove');

    // Reset attachments preview UI
    function resetAdminAttachment() {
        adminSelectedFile = null;
        if (adminFileInput) adminFileInput.value = '';
        if (adminFilePreviewChip) adminFilePreviewChip.style.display = 'none';
    }

    if (adminChatAttachBtn) {
        adminChatAttachBtn.addEventListener('click', () => adminFileInput.click());
    }
    if (adminFileInput) {
        adminFileInput.addEventListener('change', () => {
            adminSelectedFile = adminFileInput.files[0] || null;
            if (adminSelectedFile) {
                adminChipName.textContent = adminSelectedFile.name;
                adminFilePreviewChip.style.display = 'flex';
            } else {
                adminFilePreviewChip.style.display = 'none';
            }
        });
    }
    if (adminChipRemove) {
        adminChipRemove.addEventListener('click', resetAdminAttachment);
    }

    function openBookingChat(bookingId, customerName, bookingNote) {
        activeChatBookingId = bookingId;
        activeChatBookingNote = bookingNote;
        
        chatPanelName.textContent = customerName;
        chatPanelSubtitle.textContent = `Booking #${bookingId}`;
        chatPanelMessages.innerHTML = '<div class="chat-empty-state"><span class="chat-empty-icon">⏳</span><span class="chat-empty-text">Loading messages...</span></div>';
        adminChatInput.value = '';
        
        resetAdminAttachment();
        
        chatOverlay.classList.add('active');
        
        loadChatMessages();
        
        // Auto-refresh chat every 10 seconds
        if (chatRefreshInterval) clearInterval(chatRefreshInterval);
        chatRefreshInterval = setInterval(loadChatMessages, 10000);
        
        // Focus input
        setTimeout(() => adminChatInput.focus(), 400);
    }

    function closeBookingChat() {
        chatOverlay.classList.remove('active');
        activeChatBookingId = null;
        activeChatBookingNote = null;
        resetAdminAttachment();
        if (chatRefreshInterval) {
            clearInterval(chatRefreshInterval);
            chatRefreshInterval = null;
        }
    }

    if (chatPanelClose) {
        chatPanelClose.addEventListener('click', closeBookingChat);
    }
    if (chatOverlay) {
        chatOverlay.addEventListener('click', (e) => {
            if (e.target === chatOverlay) closeBookingChat();
        });
    }

    async function loadChatMessages() {
        if (!activeChatBookingId) return;
        
        try {
            const response = await fetch(`/api/admin/bookings/${activeChatBookingId}/messages`);
            if (response.status === 401) return window.location.href = '/admin/login.html';
            
            const messages = await response.json();
            renderChatMessages(messages);
        } catch (err) {
            console.error('Error loading chat messages:', err);
        }
    }

    function renderChatMessages(messages) {
        chatPanelMessages.innerHTML = '';
        
        // Show the original booking note first if it exists
        if (activeChatBookingNote) {
            chatPanelMessages.innerHTML += `
                <div class="chat-note-bubble">
                    📝 Original booking note: "${escapeHTML(activeChatBookingNote)}"
                </div>
            `;
        }
        
        if (messages.length === 0 && !activeChatBookingNote) {
            chatPanelMessages.innerHTML = `
                <div class="chat-empty-state">
                    <span class="chat-empty-icon">💬</span>
                    <span class="chat-empty-text">No messages yet. Send the first message!</span>
                </div>
            `;
            return;
        }
        
        messages.forEach(msg => {
            const isAdmin = msg.sender === 'admin';
            const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
            
            const isImage = msg.attachment_url && /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.attachment_url);
            const attachHtml = msg.attachment_url
                ? `<div class="msg-attachment">${
                    isImage
                      ? `<img src="${msg.attachment_url}" alt="${escapeHTML(msg.attachment_name || 'image')}" onclick="window.open(this.src,'_blank')">`
                      : `<a href="${msg.attachment_url}" download="${escapeHTML(msg.attachment_name || 'file')}">📄 ${escapeHTML(msg.attachment_name || 'Download file')}</a>`
                  }</div>`
                : '';
            const textHtml = (msg.message && !msg.message.startsWith('[Attached:')) ? `<div>${escapeHTML(msg.message)}</div>` : '';

            chatPanelMessages.innerHTML += `
                <div class="chat-bubble ${isAdmin ? 'admin-msg' : 'customer-msg'}">
                    <span class="chat-sender">${isAdmin ? 'You (Admin)' : '👤 Customer'}</span>
                    ${textHtml}
                    ${attachHtml}
                    <span class="chat-time">${time}</span>
                </div>
            `;
        });
        
        // Auto-scroll to bottom
        chatPanelMessages.scrollTop = chatPanelMessages.scrollHeight;
    }

    async function sendAdminMessage() {
        const message = adminChatInput.value.trim();
        if (!message && !adminSelectedFile) return;
        if (!activeChatBookingId) return;
        
        adminChatSendBtn.disabled = true;
        adminChatSendBtn.textContent = '...';
        
        try {
            let response;
            if (adminSelectedFile) {
                const fd = new FormData();
                if (message) fd.append('message', message);
                fd.append('attachment', adminSelectedFile);
                response = await fetch(`/api/admin/bookings/${activeChatBookingId}/messages`, {
                    method: 'POST',
                    body: fd
                });
            } else {
                response = await fetch(`/api/admin/bookings/${activeChatBookingId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
            }
            
            if (response.ok) {
                adminChatInput.value = '';
                resetAdminAttachment();
                await loadChatMessages(); // Reload messages
                adminChatInput.focus();
            } else {
                const err = await response.json();
                alert(err.error || 'Failed to send message.');
            }
        } catch (e) {
            alert('Connection error while sending message.');
        } finally {
            adminChatSendBtn.disabled = false;
            adminChatSendBtn.textContent = 'Send';
        }
    }

    if (adminChatSendBtn) {
        adminChatSendBtn.addEventListener('click', sendAdminMessage);
    }
    if (adminChatInput) {
        adminChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendAdminMessage();
        });
    }

});
