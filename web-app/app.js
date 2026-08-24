// VoltHome Client-Side SPA Engine & IoT Management Platform
const API_BASE = "/api/homes";
const AUTH_BASE = "/api/auth";
let homesList = [];
let activeHomeId = null;
let chartInstance = null;
let analyticsChartInstance = null;
let pieChartInstance = null;
let wsClient = null;
let notificationsList = [];

// ─── AUTHENTICATION HELPERS ───────────────────────────────────────────────────

function getToken() {
    const token = localStorage.getItem("volthome_token");
    if (!token || token === "undefined" || token === "null") {
        return null;
    }
    return token;
}

function setToken(token) {
    localStorage.setItem("volthome_token", token);
}

function removeToken() {
    localStorage.removeItem("volthome_token");
    localStorage.removeItem("volthome_user");
}

function getStoredUser() {
    try {
        return JSON.parse(localStorage.getItem("volthome_user") || "null");
    } catch (e) {
        return null;
    }
}

async function authFetch(url, options = {}) {
    const token = getToken();
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };
    if (token) {
        headers["Authorization"] = "Bearer " + token;
    }
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
        removeToken();
        showAuthModal("login");
        throw new Error("Oturum süreniz doldu. Lütfen tekrar giriş yapın.");
    }
    return response;
}

// ─── INITIALIZATION ──────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    const token = getToken();
    if (!token) {
        removeToken();
        showAuthModal("login");
    } else {
        hideAuthModal();
        updateUserUI();
        await loadHomes();
        initWebSocket();
        loadNotifications();
    }
}

function setupEventListeners() {
    const formLogin = document.getElementById("form-login");
    if (formLogin) formLogin.addEventListener("submit", handleLoginSubmit);

    const formRegister = document.getElementById("form-register");
    if (formRegister) formRegister.addEventListener("submit", handleRegisterSubmit);

    const formAddHome = document.getElementById("form-add-home");
    if (formAddHome) formAddHome.addEventListener("submit", handleAddHomeSubmit);
}

// ─── TAB NAVIGATION (SIDEBAR & TOP BAR) ───────────────────────────────────────

window.switchMainTab = function(tabId) {
    document.querySelectorAll(".sidebar-nav-item").forEach(tab => {
        if (tab.getAttribute("data-tab") === tabId) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    document.querySelectorAll(".tab-content").forEach(content => {
        if (content.id === tabId) {
            content.classList.remove("hidden");
            content.classList.add("active");
        } else {
            content.classList.add("hidden");
            content.classList.remove("active");
        }
    });

    syncHomeSelectDropdowns();

    if (tabId === "tab-3d-sim") {
        setTimeout(() => {
            if (window.initThreeSmartHome) window.initThreeSmartHome();
        }, 100);
    } else if (tabId === "tab-analytics") {
        loadAnalyticsData();
    } else if (tabId === "tab-invoices") {
        loadInvoiceData();
    } else if (tabId === "tab-ai-prediction") {
        loadAiPredictionData();
    } else if (tabId === "tab-scenarios") {
        loadScenariosData();
    }
};

function syncHomeSelectDropdowns() {
    const dropdowns = [
        "analytics-home-select",
        "invoice-home-select",
        "ai-home-select",
        "scenarios-home-select"
    ];

    dropdowns.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = "";

        if (homesList.length === 0) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "Kayıtlı Ev Yok";
            select.appendChild(opt);
        } else {
            homesList.forEach(home => {
                const opt = document.createElement("option");
                opt.value = home.id;
                opt.textContent = `${home.name} (ID: ${home.id})`;
                if (currentVal && parseInt(currentVal) === home.id) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });
        }
    });
}

function getSelectedHomeId(selectId) {
    const select = document.getElementById(selectId);
    if (select && select.value) {
        return parseInt(select.value);
    }
    if (homesList.length > 0) {
        return homesList[0].id;
    }
    return null;
}

// ─── AUTHENTICATION LOGIC ────────────────────────────────────────────────────

function showAuthModal(tab = "login") {
    const modal = document.getElementById("modal-auth");
    if (modal) modal.classList.remove("hidden");
    switchAuthTab(tab);
}

function hideAuthModal() {
    const modal = document.getElementById("modal-auth");
    if (modal) modal.classList.add("hidden");
}

window.switchAuthTab = function(tab) {
    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");
    const formLogin = document.getElementById("form-login");
    const formRegister = document.getElementById("form-register");

    if (tab === "login") {
        if (tabLogin) tabLogin.classList.add("active");
        if (tabRegister) tabRegister.classList.remove("active");
        if (formLogin) formLogin.classList.remove("hidden");
        if (formRegister) formRegister.classList.add("hidden");
    } else {
        if (tabRegister) tabRegister.classList.add("active");
        if (tabLogin) tabLogin.classList.remove("active");
        if (formRegister) formRegister.classList.remove("hidden");
        if (formLogin) formLogin.classList.add("hidden");
    }
};

async function handleLoginSubmit(e) {
    e.preventDefault();
    const usernameInput = document.getElementById("login-username").value.trim();
    const passwordInput = document.getElementById("login-password").value;

    try {
        const res = await fetch(`${AUTH_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Giriş yapılamadı.");

        const token = data.accessToken || data.token;
        if (!token) throw new Error("Sunucudan yetkilendirme anahtarı alınamadı.");

        setToken(token);
        localStorage.setItem("volthome_user", JSON.stringify({ username: data.username, email: data.email || "" }));
        hideAuthModal();
        updateUserUI();
        showToast("Başarılı", `Hoş geldiniz, ${data.username}!`, "success");
        await loadHomes();
        initWebSocket();
        loadNotifications();
    } catch (err) {
        showToast("Hata", err.message, "danger");
    }
}

async function handleRegisterSubmit(e) {
    e.preventDefault();
    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;

    try {
        const res = await fetch(`${AUTH_BASE}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Kayıt oluşturulamadı.");

        const token = data.accessToken || data.token;
        if (token) {
            setToken(token);
            localStorage.setItem("volthome_user", JSON.stringify({ username: data.username, email: data.email || email }));
            hideAuthModal();
            updateUserUI();
            showToast("Tebrikler!", "Hesabınız başarıyla oluşturuldu ve giriş yapıldı.", "success");
            await loadHomes();
            initWebSocket();
            loadNotifications();
        } else {
            showToast("Kayıt Başarılı", "Lütfen oluşturduğunuz hesapla giriş yapın.", "success");
            switchAuthTab("login");
        }
    } catch (err) {
        showToast("Kayıt Hatası", err.message, "danger");
    }
}

window.handleLogout = function() {
    removeToken();
    if (wsClient) wsClient.close();
    showAuthModal("login");
    document.getElementById("homes-grid").innerHTML = "";
    homesList = [];
    showToast("Çıkış Yapıldı", "Oturumunuz başarıyla kapatıldı.", "warning");
};

function updateUserUI() {
    const user = getStoredUser();
    if (user) {
        const sidebarUserEl = document.getElementById("sidebar-username");
        if (sidebarUserEl) sidebarUserEl.textContent = user.username;
    }
}

// ─── WEBSOCKET REAL-TIME TELEMETRY ───────────────────────────────────────────

function initWebSocket() {
    const token = getToken();
    if (!token) return;

    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        return;
    }

    const loc = window.location;
    const wsProto = loc.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProto}//${loc.host}/ws/telemetry?token=${token}`;

    try {
        wsClient = new WebSocket(wsUrl);

        wsClient.onopen = () => {
            console.log("WebSocket connected to VoltHome live telemetry stream.");
        };

        wsClient.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === "TELEMETRY_UPDATE") {
                    handleLiveTelemetryMessage(message.homeId, message.data);
                }
            } catch (e) {
                console.error("Error parsing WS message:", e);
            }
        };

        wsClient.onclose = () => {
            console.log("WebSocket closed. Attempting reconnect in 4s...");
            setTimeout(initWebSocket, 4000);
        };

        wsClient.onerror = (err) => {
            console.error("WebSocket error:", err);
            wsClient.close();
        };
    } catch (e) {
        console.error("Could not create WebSocket connection:", e);
    }
}

function handleLiveTelemetryMessage(homeId, liveState) {
    if (!liveState) return;

    const home = homesList.find(h => h.id === homeId);
    if (home) {
        home.cumulativeEnergyKwh = liveState.cumulativeEnergyKwh;
        home.currentBalance = liveState.cumulativeCost;
    }

    updateGlobalDashboardStats();
    updateStickyTopBar();

    if (activeHomeId === homeId) {
        renderLiveModalState(liveState);
    }
}

// ─── TOP METRICS & STATS ──────────────────────────────────────────────────────

function updateStickyTopBar() {
    let totalCost = 0;
    let tariffLabel = "Gündüz (3.85 TL/kWh)";

    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) {
        tariffLabel = "Gece (2.10 TL/kWh)";
    }

    homesList.forEach(home => {
        if (home.currentBalance) totalCost += home.currentBalance;
    });

    const topPowerEl = document.getElementById("top-live-power");
    const topTariffEl = document.getElementById("top-active-tariff");
    const topCostEl = document.getElementById("top-live-cost");

    if (topPowerEl) {
        const estimatedKw = (Math.max(1.2, homesList.length * 1.45)).toFixed(2);
        topPowerEl.textContent = `${estimatedKw} kW`;
    }
    if (topTariffEl) topTariffEl.textContent = tariffLabel;
    if (topCostEl) topCostEl.textContent = `${totalCost.toFixed(2)} TL`;
}

function updateGlobalDashboardStats() {
    const totalHomes = homesList.length;
    let totalKwh = 0;
    let totalCost = 0;

    homesList.forEach(home => {
        totalKwh += (home.cumulativeEnergyKwh || 0);
        totalCost += (home.currentBalance || 0);
    });

    const statHomesEl = document.getElementById("stat-total-homes");
    const statEnergyEl = document.getElementById("stat-total-energy");
    const statCostEl = document.getElementById("stat-total-cost");
    const co2El = document.getElementById("stat-total-co2");

    if (statHomesEl) statHomesEl.textContent = totalHomes;
    if (statEnergyEl) statEnergyEl.textContent = `${totalKwh.toFixed(2)} kWh`;
    if (statCostEl) statCostEl.textContent = `${totalCost.toFixed(2)} TL`;

    if (co2El) {
        const totalCo2 = (totalKwh * 0.42).toFixed(1);
        co2El.textContent = `${totalCo2} kg`;
    }
}

// ─── HOMES DATA FETCHING & RENDERING ──────────────────────────────────────────

async function loadHomes() {
    const loadingEl = document.getElementById("homes-loading");
    const emptyEl = document.getElementById("homes-empty");
    const gridEl = document.getElementById("homes-grid");

    try {
        if (loadingEl) loadingEl.classList.remove("hidden");
        const res = await authFetch(API_BASE);
        homesList = await res.json();
        if (loadingEl) loadingEl.classList.add("hidden");

        if (homesList.length === 0) {
            if (emptyEl) emptyEl.classList.remove("hidden");
            if (gridEl) gridEl.classList.add("hidden");
        } else {
            if (emptyEl) emptyEl.classList.add("hidden");
            if (gridEl) {
                gridEl.classList.remove("hidden");
                renderHomesGrid();
            }
        }

        updateGlobalDashboardStats();
        updateStickyTopBar();
        syncHomeSelectDropdowns();
    } catch (err) {
        if (loadingEl) loadingEl.classList.add("hidden");
        showToast("Hata", "Ev listesi yüklenemedi: " + err.message, "danger");
    }
}

function renderHomesGrid() {
    const gridEl = document.getElementById("homes-grid");
    if (!gridEl) return;
    gridEl.innerHTML = "";

    homesList.forEach(home => {
        const spent = home.currentBalance || 0;
        const quota = home.budgetQuota || 1000;
        const pct = Math.min(100, Math.round((spent / quota) * 100));

        let progressClass = "green";
        let badgeClass = "badge-green";
        let statusText = "NORMAL";

        if (pct >= 100) {
            progressClass = "red";
            badgeClass = "badge-red";
            statusText = "LİMİT AŞIMI";
        } else if (pct >= 80) {
            progressClass = "orange";
            badgeClass = "badge-orange";
            statusText = "UYARI %80+";
        }

        const card = document.createElement("div");
        card.className = "home-card glass-panel";
        card.onclick = () => openHomeDetailModal(home.id);

        card.innerHTML = `
            <div class="home-card-header">
                <div class="home-title">
                    <h3>${escapeHtml(home.name)}</h3>
                    <span>${escapeHtml(home.contactEmail)}</span>
                </div>
                <span class="badge ${badgeClass}">${statusText}</span>
            </div>

            <div class="budget-progress-container">
                <div class="budget-labels">
                    <span>Bütçe Kullanımı: <strong>%${pct}</strong></span>
                    <span>${spent.toFixed(2)} / ${quota.toFixed(0)} TL</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill ${progressClass}" style="width: ${pct}%"></div>
                </div>
            </div>

            <div class="home-card-metrics">
                <div class="metric-item">
                    <span>Toplam Tüketim</span>
                    <strong class="text-neon-green">${(home.cumulativeEnergyKwh || 0).toFixed(2)} kWh</strong>
                </div>
                <div class="metric-item">
                    <span>Cihaz Sayısı</span>
                    <strong class="text-neon-blue">${home.appliances ? home.appliances.length : 0} Adet</strong>
                </div>
            </div>
        `;
        gridEl.appendChild(card);
    });
}

// ─── REMOTE SWITCH CONTROL ───────────────────────────────────────────────────

window.toggleDeviceSwitch = async function(homeId, applianceId, currentTurnedOff, event) {
    if (event) event.stopPropagation();
    const action = currentTurnedOff ? "TURN_ON" : "SHUTDOWN";

    try {
        const res = await authFetch(`${API_BASE}/${homeId}/appliances/${applianceId}/toggle`, {
            method: "POST",
            body: JSON.stringify({ action })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Komut gönderilemedi.");

        showToast("Cihaz Anahtarı", `Cihaz ${action === "TURN_ON" ? "açıldı" : "kapatıldı"}. (Kafka komutu iletildi)`, "success");
        
        if (activeHomeId === homeId) {
            updateHomeDetails();
        }
    } catch (err) {
        showToast("Anahtar Hatası", err.message, "danger");
    }
};

// ─── HOME DETAIL & MONITORING MODAL ──────────────────────────────────────────

window.openHomeDetailModal = async function(id) {
    activeHomeId = id;
    const modal = document.getElementById("modal-home-detail");
    modal.classList.remove("hidden");

    const home = homesList.find(h => h.id === id);
    if (home) {
        document.getElementById("detail-home-name").textContent = home.name;
        document.getElementById("detail-home-email").textContent = home.contactEmail;
        document.getElementById("detail-quota-badge").textContent = `Bütçe Kotası: ${home.budgetQuota} TL`;
    }

    await updateHomeDetails();
    await fetchAndDrawTrendChart(id);
    await fetchPrediction(id);
};

window.closeHomeDetailModal = function() {
    document.getElementById("modal-home-detail").classList.add("hidden");
    activeHomeId = null;
};

async function updateHomeDetails() {
    if (!activeHomeId) return;
    try {
        const res = await authFetch(`${API_BASE}/${activeHomeId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        renderLiveModalState(data.liveState, data.latestAIRecommendation);
    } catch (e) {
        console.error("Error updating home details:", e);
    }
}

function renderLiveModalState(liveState, aiText) {
    if (!liveState) return;

    document.getElementById("detail-cumulative-energy").textContent = `${(liveState.cumulativeEnergyKwh || 0).toFixed(2)} kWh`;
    document.getElementById("detail-cumulative-cost").textContent = `${(liveState.cumulativeCost || 0).toFixed(2)} TL`;
    document.getElementById("detail-tariff-rate").textContent = `${(liveState.tariffRate || 3.85).toFixed(2)} TL/kWh`;

    const tariffStatusEl = document.getElementById("detail-tariff-status");
    if (liveState.isPenaltyTariff) {
        tariffStatusEl.innerHTML = `<span class="badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i> CEZALI TARİFE (%50)</span>`;
    } else {
        tariffStatusEl.innerHTML = `<span class="badge badge-green"><i class="fa-solid fa-shield-check"></i> STANDART EPDK</span>`;
    }

    if (aiText && document.getElementById("ai-content-box")) {
        document.getElementById("ai-content-box").textContent = aiText;
    }

    const appGrid = document.getElementById("detail-appliances-grid");
    appGrid.innerHTML = "";

    const appliances = liveState.appliances || {};
    const appKeys = Object.keys(appliances);

    if (appKeys.length === 0) {
        appGrid.innerHTML = `<p class="text-muted">Bu eve ait canlı cihaz telemetrisi bekleniyor...</p>`;
    } else {
        appKeys.forEach(key => {
            const app = appliances[key];
            const isBreach = app.consecutiveBreaches >= 3;
            const isTurnedOff = app.turnedOff || app.currentWattage === 0;

            let cardBorder = "";
            let statusBadge = `<span class="badge badge-green">ÇALIŞIYOR</span>`;

            if (isTurnedOff) {
                statusBadge = `<span class="badge badge-blue">KAPALI / STANDBY</span>`;
            } else if (isBreach) {
                cardBorder = "border-color: var(--neon-red);";
                statusBadge = `<span class="badge badge-red">ANOMALİ (${app.consecutiveBreaches})</span>`;
            }

            const card = document.createElement("div");
            card.className = "appliance-live-card glass-panel";
            if (cardBorder) card.style = cardBorder;

            card.innerHTML = `
                <div class="appliance-card-top">
                    <div class="app-identity">
                        <div class="app-icon"><i class="fa-solid fa-plug"></i></div>
                        <div>
                            <strong>${escapeHtml(app.applianceName || 'Cihaz')}</strong>
                            <div style="font-size: 11px; color: var(--text-muted);">Safe Limit: ${app.safeLimitWatt}W</div>
                        </div>
                    </div>
                    ${statusBadge}
                </div>

                <div class="app-power-display">
                    <span>Anlık Güç:</span>
                    <strong class="app-power-val ${isBreach ? 'text-neon-red' : 'text-neon-green'}">${(app.currentWattage || 0).toFixed(1)} W</strong>
                </div>

                <button class="btn-device-switch ${isTurnedOff ? 'off' : 'on'}" 
                        onclick="toggleDeviceSwitch(${activeHomeId}, ${app.applianceId}, ${isTurnedOff}, event)">
                    <i class="fa-solid fa-power-off"></i> ${isTurnedOff ? 'Cihazı Aç (ON)' : 'Cihazı Kapat (OFF)'}
                </button>
            `;
            appGrid.appendChild(card);
        });
    }
}

// ─── TAB 3: ANALYTICS & CHARTS ───────────────────────────────────────────────

window.loadAnalyticsData = async function() {
    const homeId = getSelectedHomeId("analytics-home-select");
    if (!homeId) return;

    try {
        const res = await authFetch(`${API_BASE}/${homeId}/trends`);
        if (!res.ok) return;
        const history = await res.json();

        // Line Chart
        const labels = history.map(h => {
            const d = new Date(h.recordedAt);
            return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        });
        const energyData = history.map(h => h.cumulativeEnergyKwh);
        const costData = history.map(h => h.cumulativeCost);

        const ctx = document.getElementById("chart-analytics-trends").getContext("2d");
        if (analyticsChartInstance) analyticsChartInstance.destroy();

        analyticsChartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels.length ? labels : ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"],
                datasets: [
                    {
                        label: "Kümülatif Tüketim (kWh)",
                        data: energyData.length ? energyData : [0.5, 1.2, 2.4, 3.8, 5.2, 6.7],
                        borderColor: "#059669",
                        backgroundColor: "rgba(5, 150, 105, 0.08)",
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: "Kümülatif Tutar (TL)",
                        data: costData.length ? costData : [1.9, 4.6, 9.2, 14.6, 20.0, 25.8],
                        borderColor: "#0284c7",
                        backgroundColor: "rgba(2, 132, 199, 0.08)",
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: "#0f172a", font: { weight: "600" } } } },
                scales: {
                    x: { ticks: { color: "#64748b" }, grid: { color: "rgba(0, 0, 0, 0.05)" } },
                    y: { ticks: { color: "#64748b" }, grid: { color: "rgba(0, 0, 0, 0.05)" } }
                }
            }
        });

        // Pie Chart
        const pieCtx = document.getElementById("chart-appliance-pie").getContext("2d");
        if (pieChartInstance) pieChartInstance.destroy();

        pieChartInstance = new Chart(pieCtx, {
            type: "doughnut",
            data: {
                labels: ["Klima (AC)", "Buzdolabı", "Çamaşır Mak.", "Isıtıcı", "Diğer"],
                datasets: [{
                    data: [42, 24, 18, 11, 5],
                    backgroundColor: [
                        "#059669",
                        "#10b981",
                        "#0284c7",
                        "#d97706",
                        "#94a3b8"
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "bottom", labels: { color: "#0f172a", font: { weight: "500" } } } }
            }
        });
    } catch (err) {
        console.error("Analytics load error:", err);
    }
};

// ─── TAB 4: INVOICES & STATEMENTS ───────────────────────────────────────────

let currentInvoiceData = null;

window.loadInvoiceData = async function() {
    const homeId = getSelectedHomeId("invoice-home-select");
    if (!homeId) return;

    try {
        const res = await authFetch(`${API_BASE}/${homeId}/invoices`);
        if (!res.ok) return;
        currentInvoiceData = await res.json();

        const currentBill = currentInvoiceData.currentBill;
        document.getElementById("inv-current-period").textContent = currentBill.period;
        document.getElementById("inv-current-total").textContent = `${currentBill.totalAmount.toFixed(2)} TL`;
        document.getElementById("inv-current-due").textContent = currentBill.dueDate;
        document.getElementById("inv-current-kwh").textContent = `${currentBill.totalKwh.toFixed(2)} kWh`;
        document.getElementById("inv-current-day").textContent = `${currentBill.dayKwh.toFixed(2)} kWh`;
        document.getElementById("inv-current-night").textContent = `${currentBill.nightKwh.toFixed(2)} kWh`;
        document.getElementById("inv-current-dist").textContent = `${currentBill.distributionCost.toFixed(2)} TL`;
        document.getElementById("inv-current-tax").textContent = `${(currentBill.energyFund + currentBill.trtTax).toFixed(2)} TL`;
        document.getElementById("inv-current-kdv").textContent = `${currentBill.kdv.toFixed(2)} TL`;

        const tbody = document.getElementById("past-invoices-tbody");
        tbody.innerHTML = "";

        currentInvoiceData.archivedBills.forEach(inv => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${inv.invoiceNo}</strong></td>
                <td>${inv.period}</td>
                <td>${inv.totalKwh} kWh</td>
                <td class="text-neon-orange">${inv.totalAmount.toFixed(2)} TL</td>
                <td><span class="badge badge-green">${inv.status}</span></td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="openPrintInvoiceModal()">
                        <i class="fa-solid fa-eye"></i> İncele
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Invoice load error:", err);
    }
};

window.openPrintInvoiceModal = function() {
    if (!currentInvoiceData) return;
    const modal = document.getElementById("modal-invoice-detail");
    modal.classList.remove("hidden");

    const bill = currentInvoiceData.currentBill;
    document.getElementById("pdf-invoice-no").textContent = bill.invoiceNo;
    document.getElementById("pdf-due-date").textContent = bill.dueDate;
    document.getElementById("pdf-subscriber-name").textContent = currentInvoiceData.customerName;
    document.getElementById("pdf-subscriber-email").textContent = currentInvoiceData.customerEmail;

    const itemsTbody = document.getElementById("pdf-invoice-items");
    itemsTbody.innerHTML = `
        <tr>
            <td>Aktif Enerji Tüketimi (Gündüz T1)</td>
            <td>${bill.dayKwh.toFixed(2)} kWh</td>
            <td>3.85 TL/kWh</td>
            <td>${(bill.dayKwh * 3.85).toFixed(2)} TL</td>
        </tr>
        <tr>
            <td>Aktif Enerji Tüketimi (Gece T2)</td>
            <td>${bill.nightKwh.toFixed(2)} kWh</td>
            <td>2.10 TL/kWh</td>
            <td>${(bill.nightKwh * 2.10).toFixed(2)} TL</td>
        </tr>
        <tr>
            <td>Dağıtım ve İletim Hizmet Bedeli</td>
            <td>${bill.totalKwh.toFixed(2)} kWh</td>
            <td>0.85 TL/kWh</td>
            <td>${bill.distributionCost.toFixed(2)} TL</td>
        </tr>
    `;

    document.getElementById("pdf-subtotal").textContent = `${(bill.energyCost + bill.distributionCost).toFixed(2)} TL`;
    document.getElementById("pdf-funds").textContent = `${(bill.energyFund + bill.trtTax).toFixed(2)} TL`;
    document.getElementById("pdf-kdv").textContent = `${bill.kdv.toFixed(2)} TL`;
    document.getElementById("pdf-grand-total").textContent = `${bill.totalAmount.toFixed(2)} TL`;
};

window.closePrintInvoiceModal = function() {
    document.getElementById("modal-invoice-detail").classList.add("hidden");
};

// ─── TAB 5: AI PREDICTION & INSIGHTS ────────────────────────────────────────

window.loadAiPredictionData = async function() {
    const homeId = getSelectedHomeId("ai-home-select");
    if (!homeId) return;
    await fetchPrediction(homeId, true);
};

window.triggerAiFromTab = async function() {
    const homeId = getSelectedHomeId("ai-home-select");
    if (!homeId) return;

    const loadingEl = document.getElementById("tab-ai-loading");
    const contentEl = document.getElementById("tab-ai-content");

    loadingEl.classList.remove("hidden");
    contentEl.textContent = "";

    try {
        const res = await authFetch(`${API_BASE}/${homeId}/ai-recommendation`, { method: "POST" });
        const data = await res.json();
        loadingEl.classList.add("hidden");
        contentEl.textContent = data.recommendationText || "Öneri üretilemedi.";
        showToast("AI Danışmanı", "Yeni tasarruf reçeteniz Gemini tarafından üretildi!", "success");
    } catch (err) {
        loadingEl.classList.add("hidden");
        showToast("Hata", err.message, "danger");
    }
};

async function fetchPrediction(homeId, isTab = false) {
    try {
        const res = await authFetch(`${API_BASE}/${homeId}/prediction`);
        if (!res.ok) return;
        const p = await res.json();

        const prefix = isTab ? "tab-pred" : "pred";
        document.getElementById(`${prefix}-kwh`).textContent = `${p.projectedKwh} kWh`;
        document.getElementById(`${prefix}-cost`).textContent = `${p.projectedCostTl} TL`;
        document.getElementById(`${prefix}-quota`).textContent = `${p.budgetQuota} TL`;
        document.getElementById(`${prefix}-days-remaining`).textContent = `${p.daysRemainingInMonth} Gün`;
        document.getElementById(`${prefix}-tariff-label`).textContent = p.currentTariffLabel;
        document.getElementById(`${prefix}-overshoot`).textContent = `${p.budgetOvershootPercent > 0 ? '+' : ''}${p.budgetOvershootPercent}%`;

        const badge = document.getElementById(`${prefix}-status-badge`);
        if (badge) {
            badge.className = `badge ${p.budgetStatus === 'EXCEEDED' ? 'badge-red' : p.budgetStatus === 'WARNING' ? 'badge-orange' : 'badge-green'}`;
            badge.textContent = p.budgetStatusLabel;
        }

        if (isTab && document.getElementById("tab-ai-content") && !document.getElementById("tab-ai-content").textContent) {
            document.getElementById("tab-ai-content").textContent = `1. Yüksek güç çeken cihazları (Klima, Çamaşır Makinesi) 22:00 sonrasında çalıştırarak %35 tasarruf edin.\n2. Standby modunda kalan televizyon ve şarj aletlerini prizden çekerek gereksiz kaçakları önleyin.\n3. Safe limit değerinizi aşan cihazlar için akıllı otomasyon sigortasını aktif tutun.`;
        }
    } catch (e) {
        console.error("Prediction error:", e);
    }
}

// ─── TAB 6: SCENARIOS & AUTOMATION RULES ──────────────────────────────────────

window.loadScenariosData = async function() {
    const homeId = getSelectedHomeId("scenarios-home-select");
    if (!homeId) return;
    await fetchAutomationRules(homeId);
};

window.togglePresetScenario = function(scenarioType, isChecked) {
    showToast("Senaryo Güncellendi", `${scenarioType} senaryosu ${isChecked ? 'aktif' : 'pasif'} duruma getirildi.`, "success");
};

async function fetchAutomationRules(homeId) {
    try {
        const res = await authFetch(`${API_BASE}/${homeId}/rules`);
        if (!res.ok) return;
        const rules = await res.json();
        renderAutomationRules(homeId, rules);
    } catch (e) {
        console.error("Rules fetch error:", e);
    }
}

function renderAutomationRules(homeId, rules) {
    const list = document.getElementById("tab-automation-rules-list");
    if (!list) return;
    list.innerHTML = "";

    if (rules.length === 0) {
        list.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">Bu ev için henüz tanımlanmış özel otomasyon kuralı bulunmamaktadır.</p>`;
        return;
    }

    rules.forEach(rule => {
        const el = document.createElement("div");
        el.className = `rule-card glass-panel ${rule.enabled ? 'rule-enabled' : 'rule-disabled'}`;
        el.innerHTML = `
            <div class="rule-info">
                <span class="rule-device-badge"><i class="fa-solid fa-plug"></i> ${rule.deviceType === '*' ? 'Tüm Cihazlar' : rule.deviceType}</span>
                <div class="rule-description">${formatRuleDescription(rule)}</div>
                <div class="rule-meta">Aksiyon: <strong>${rule.action}</strong></div>
            </div>
            <div class="rule-actions">
                <label class="switch">
                    <input type="checkbox" ${rule.enabled ? 'checked' : ''} onchange="toggleRule(${homeId}, ${rule.id})">
                    <span class="slider round"></span>
                </label>
                <button class="btn-delete-rule" onclick="deleteRule(${homeId}, ${rule.id})" title="Kuralı Sil">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        list.appendChild(el);
    });
}

function formatRuleDescription(rule) {
    switch (rule.triggerType) {
        case 'ANOMALY': return 'Cihaz ardışık 3 kez safe limiti aştığında (Anomali)';
        case 'BUDGET_80': return 'Aylık harcama bütçenin %80\'ine ulaştığında';
        case 'BUDGET_100': return 'Aylık bütçe kotası tamamen aşıldığında (%100)';
        case 'WATTAGE_EXCEED': return `Anlık güç ${rule.triggerValue} Watt sınırını geçtiğinde`;
        default: return rule.triggerType;
    }
}

window.openAddRuleForm = function() {
    document.getElementById("add-rule-form").classList.remove("hidden");
};

window.closeAddRuleForm = function() {
    document.getElementById("add-rule-form").classList.add("hidden");
};

window.updateRuleTriggerUI = function() {
    const trigger = document.getElementById("rule-trigger-type").value;
    const valueInput = document.getElementById("rule-trigger-value");
    if (trigger === "WATTAGE_EXCEED") {
        valueInput.classList.remove("hidden");
    } else {
        valueInput.classList.add("hidden");
    }
};

window.submitNewRule = async function() {
    const homeId = getSelectedHomeId("scenarios-home-select");
    if (!homeId) return;

    const deviceType = document.getElementById("rule-device-type").value;
    const triggerType = document.getElementById("rule-trigger-type").value;
    const action = document.getElementById("rule-action").value;
    const triggerValue = triggerType === "WATTAGE_EXCEED" ? parseFloat(document.getElementById("rule-trigger-value").value) || 0 : null;

    try {
        const res = await authFetch(`${API_BASE}/${homeId}/rules`, {
            method: "POST",
            body: JSON.stringify({ deviceType, triggerType, action, triggerValue })
        });
        if (!res.ok) throw new Error("Kural kaydedilemedi.");

        closeAddRuleForm();
        showToast("Başarılı", "Otomasyon kuralı başarıyla eklendi.", "success");
        await fetchAutomationRules(homeId);
    } catch (err) {
        showToast("Kural Hatası", err.message, "danger");
    }
};

window.toggleRule = async function(homeId, ruleId) {
    try {
        const res = await authFetch(`${API_BASE}/${homeId}/rules/${ruleId}/toggle`, { method: "PATCH" });
        if (!res.ok) throw new Error("Kural güncellenemedi.");
        showToast("Güncellendi", "Kural durumu değiştirildi.", "success");
        await fetchAutomationRules(homeId);
    } catch (err) {
        showToast("Hata", err.message, "danger");
    }
};

window.deleteRule = async function(homeId, ruleId) {
    if (!confirm("Bu otomasyon kuralını silmek istediğinize emin misiniz?")) return;
    try {
        const res = await authFetch(`${API_BASE}/${homeId}/rules/${ruleId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Kural silinemedi.");
        showToast("Silindi", "Kural başarıyla kaldırıldı.", "success");
        await fetchAutomationRules(homeId);
    } catch (err) {
        showToast("Hata", err.message, "danger");
    }
};

// ─── NOTIFICATION DRAWER ─────────────────────────────────────────────────────

window.toggleNotificationDrawer = function() {
    const drawer = document.getElementById("drawer-notifications");
    drawer.classList.toggle("hidden");
    if (!drawer.classList.contains("hidden")) {
        loadNotifications();
    }
};

async function loadNotifications() {
    try {
        const res = await authFetch("/api/notifications");
        if (!res.ok) return;
        notificationsList = await res.json();

        const badge = document.getElementById("notif-badge");
        const sidebarBadge = document.getElementById("sidebar-notif-badge");
        if (badge) badge.textContent = notificationsList.length;
        if (sidebarBadge) sidebarBadge.textContent = notificationsList.length;

        const listEl = document.getElementById("notifications-list");
        if (!listEl) return;
        listEl.innerHTML = "";

        if (notificationsList.length === 0) {
            listEl.innerHTML = `<p style="color: var(--text-muted); padding: 20px; text-align: center;">Henüz yeni bir bildirim bulunmuyor.</p>`;
            return;
        }

        notificationsList.forEach(n => {
            const item = document.createElement("div");
            item.className = `notif-item ${n.eventType.includes('ANOMALY') || n.eventType.includes('EXCEED') ? 'alarm' : ''}`;
            item.innerHTML = `
                <i class="fa-solid ${n.eventType.includes('ANOMALY') ? 'fa-triangle-exclamation text-neon-red' : 'fa-bell text-neon-blue'}"></i>
                <div class="notif-item-body">
                    <h5>${escapeHtml(n.homeName)} — ${escapeHtml(n.eventType)}</h5>
                    <p>${escapeHtml(n.description)}</p>
                    <div class="notif-time">${n.createdAt}</div>
                </div>
            `;
            listEl.appendChild(item);
        });
    } catch (e) {
        console.error("Notifications error:", e);
    }
}

// ─── VOLTHOME PRO MEMBERSHIP MODAL ───────────────────────────────────────────

window.openProModal = function() {
    document.getElementById("modal-pro").classList.remove("hidden");
};

window.closeProModal = function() {
    document.getElementById("modal-pro").classList.add("hidden");
};

window.activateProPlan = function() {
    closeProModal();
    showToast("VoltHome PRO Aktif!", "Tebrikler! PRO üyeliğiniz aktif edildi. Sınırsız AI Danışman ve 3D Simülasyonun keyfini çıkarın.", "success");
};

// ─── ADD HOME MODAL & APPLIANCES ─────────────────────────────────────────────

window.openAddHomeModal = function() {
    document.getElementById("modal-add-home").classList.remove("hidden");
    document.getElementById("form-add-home").reset();
    document.getElementById("appliances-list").innerHTML = "";
    addApplianceRow();
};

window.closeAddHomeModal = function() {
    document.getElementById("modal-add-home").classList.add("hidden");
};

window.addApplianceRow = function() {
    const list = document.getElementById("appliances-list");
    const row = document.createElement("div");
    row.className = "appliance-row";
    row.innerHTML = `
        <input type="text" class="app-name" placeholder="Cihaz Adı (Örn: Klima)" required>
        <select class="app-type">
            <option value="AC">Klima (AC)</option>
            <option value="REFRIGERATOR">Buzdolabı</option>
            <option value="WASHING_MACHINE">Çamaşır Makinesi</option>
            <option value="HEATER">Isıtıcı</option>
            <option value="TELEVISION">Televizyon</option>
            <option value="OTHER">Diğer</option>
        </select>
        <input type="number" class="app-limit" placeholder="Limit (W) Örn: 2000" min="10" required>
        <button type="button" class="btn-remove-row" onclick="removeApplianceRow(this)">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    `;
    list.appendChild(row);
};

window.removeApplianceRow = function(button) {
    const list = document.getElementById("appliances-list");
    if (list.children.length > 1) {
        button.closest(".appliance-row").remove();
    } else {
        showToast("Uyarı", "En az 1 adet cihaz eklemelisiniz.", "warning");
    }
};

async function handleAddHomeSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("home-name").value.trim();
    const contactEmail = document.getElementById("home-email").value.trim();
    const budgetQuota = parseFloat(document.getElementById("home-quota").value);

    const rows = document.querySelectorAll("#appliances-list .appliance-row");
    const appliances = [];

    rows.forEach(row => {
        const appName = row.querySelector(".app-name").value.trim();
        const appType = row.querySelector(".app-type").value;
        const appLimit = parseFloat(row.querySelector(".app-limit").value);
        if (appName && appLimit) {
            appliances.push({ name: appName, type: appType, safeLimitWatt: appLimit });
        }
    });

    try {
        const res = await authFetch(API_BASE, {
            method: "POST",
            body: JSON.stringify({ name, contactEmail, budgetQuota, appliances })
        });
        if (!res.ok) throw new Error("Ev kaydedilemedi.");

        closeAddHomeModal();
        showToast("Başarılı", `"${name}" evi sisteme eklendi ve IoT simülasyonu başlatıldı.`, "success");
        await loadHomes();
    } catch (err) {
        showToast("Kayıt Hatası", err.message, "danger");
    }
}

// ─── CHARTS & AI HELPERS ─────────────────────────────────────────────────────

async function fetchAndDrawTrendChart(homeId) {
    try {
        const res = await authFetch(`${API_BASE}/${homeId}/trends`);
        if (!res.ok) return;
        const history = await res.json();

        const labels = history.map(h => {
            const d = new Date(h.recordedAt);
            return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        });
        const energyData = history.map(h => h.cumulativeEnergyKwh);
        const costData = history.map(h => h.cumulativeCost);

        const ctx = document.getElementById("chart-consumption-trends").getContext("2d");
        if (chartInstance) chartInstance.destroy();

        chartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels.length ? labels : ["00:00", "04:00", "08:00", "12:00"],
                datasets: [
                    {
                        label: "Kümülatif Tüketim (kWh)",
                        data: energyData.length ? energyData : [0.5, 1.2, 2.4, 3.8],
                        borderColor: "#059669",
                        backgroundColor: "rgba(5, 150, 105, 0.08)",
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: "Kümülatif Tutar (TL)",
                        data: costData.length ? costData : [1.9, 4.6, 9.2, 14.6],
                        borderColor: "#0284c7",
                        backgroundColor: "rgba(2, 132, 199, 0.08)",
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: "#0f172a", font: { weight: "600" } } } },
                scales: {
                    x: { ticks: { color: "#64748b" }, grid: { color: "rgba(0, 0, 0, 0.05)" } },
                    y: { ticks: { color: "#64748b" }, grid: { color: "rgba(0, 0, 0, 0.05)" } }
                }
            }
        });
    } catch (e) {
        console.error("Trend chart error:", e);
    }
}

window.triggerManualAIRecommendation = async function() {
    if (!activeHomeId) return;
    const loadingEl = document.getElementById("ai-loading");
    const contentEl = document.getElementById("ai-content-box");

    loadingEl.classList.remove("hidden");
    contentEl.textContent = "";

    try {
        const res = await authFetch(`${API_BASE}/${activeHomeId}/ai-recommendation`, { method: "POST" });
        const data = await res.json();
        loadingEl.classList.add("hidden");
        contentEl.textContent = data.recommendationText || "Öneri üretilemedi.";
        showToast("AI Danışmanı", "Yeni öneriler hazırlandı!", "success");
    } catch (err) {
        loadingEl.classList.add("hidden");
        showToast("İşlem Başarısız", err.message, "danger");
    }
};

// ─── UTILITY FUNCTIONS ────────────────────────────────────────────────────────

function showToast(title, message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const iconMap = {
        success: "fa-circle-check text-neon-green",
        warning: "fa-triangle-exclamation text-neon-orange",
        danger: "fa-circle-xmark text-neon-red"
    };

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${iconMap[type] || iconMap.success}" style="font-size: 20px;"></i>
        <div>
            <h4 style="font-size: 13px; font-weight: 700;">${escapeHtml(title)}</h4>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(message)}</p>
        </div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(50px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

function escapeHtml(text) {
    if (!text) return "";
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
