// VoltHome Client-Side SPA Engine
const API_BASE = "http://localhost:8080/api/homes";
const AUTH_BASE = "http://localhost:8080/api/auth";
let homesList = [];
let activeHomeId = null;
let chartInstance = null;
let socket = null;

// Auth state
let authToken = localStorage.getItem("voltHomeToken");
let authUser = localStorage.getItem("voltHomeUser");

// Track previously seen warnings to prevent spamming notifications on client side
const triggeredClientAlerts = {
    warning80: {},
    warning100: {},
    anomalies: {}
};

document.addEventListener("DOMContentLoaded", () => {
    // Check if authenticated on load
    checkAuthentication();

    // Event Bindings
    document.getElementById("btn-open-add-home").addEventListener("click", openAddHomeModal);
    document.getElementById("btn-add-appliance-row").addEventListener("click", addApplianceRow);
    document.getElementById("form-add-home").addEventListener("submit", handleAddHomeSubmit);
    
    // Auth Forms Bindings
    document.getElementById("form-login").addEventListener("submit", handleLoginSubmit);
    document.getElementById("form-register").addEventListener("submit", handleRegisterSubmit);
});

// Helper for authenticated headers
function getHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": authToken ? `Bearer ${authToken}` : ""
    };
}

// Switch between login and register tabs
window.switchAuthTab = function(tab) {
    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");
    const formLogin = document.getElementById("form-login");
    const formRegister = document.getElementById("form-register");
    
    if (tab === 'login') {
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        formLogin.classList.remove("hidden");
        formRegister.classList.add("hidden");
    } else {
        tabLogin.classList.remove("active");
        tabRegister.classList.add("active");
        formLogin.classList.add("hidden");
        formRegister.classList.remove("hidden");
    }
};

// Check if token exists, toggle UI overlays
function checkAuthentication() {
    if (authToken && authUser) {
        document.getElementById("modal-auth").classList.add("hidden");
        document.getElementById("user-info-display").classList.remove("hidden");
        document.getElementById("display-username").innerHTML = `<i class="fa-solid fa-user text-neon-blue"></i> ${escapeHtml(authUser)}`;
        
        // Fetch initial user homes
        fetchHomes();
        // Open real-time telemetry stream
        connectWebSocket();
    } else {
        document.getElementById("modal-auth").classList.remove("hidden");
        document.getElementById("user-info-display").classList.add("hidden");
        if (socket) {
            socket.close();
            socket = null;
        }
    }
}

// Authenticate & get JWT Token
async function handleLoginSubmit(e) {
    e.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    
    try {
        const res = await fetch(`${AUTH_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || "Giriş başarısız!");
        }
        
        const data = await res.json();
        authToken = data.accessToken;
        authUser = data.username;
        
        localStorage.setItem("voltHomeToken", authToken);
        localStorage.setItem("voltHomeUser", authUser);
        
        showToast("Giriş Başarılı", `Hoş geldiniz, ${authUser}!`, "success");
        
        // Reset forms
        document.getElementById("form-login").reset();
        
        checkAuthentication();
    } catch (err) {
        showToast("Giriş Başarısız", err.message, "danger");
    }
}

// Register user account
async function handleRegisterSubmit(e) {
    e.preventDefault();
    const username = document.getElementById("register-username").value;
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;
    
    try {
        const res = await fetch(`${AUTH_BASE}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password })
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || "Kayıt başarısız!");
        }
        
        showToast("Kayıt Başarılı", "Hesabınız oluşturuldu. Giriş yapabilirsiniz.", "success");
        document.getElementById("form-register").reset();
        switchAuthTab('login');
    } catch (err) {
        showToast("Kayıt Başarısız", err.message, "danger");
    }
}

// Log out user
window.handleLogout = function() {
    authToken = null;
    authUser = null;
    localStorage.removeItem("voltHomeToken");
    localStorage.removeItem("voltHomeUser");
    
    showToast("Oturum Kapatıldı", "Güvenli çıkış yapıldı.", "info");
    
    // Close modal details if open
    closeHomeDetailModal();
    closeAddHomeModal();
    
    // Clear screen
    homesList = [];
    renderHomesGrid();
    calculateGlobalStats();
    
    checkAuthentication();
};

// Connect WebSocket to backend stream
function connectWebSocket() {
    if (!authToken) return;
    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    // Fallback to localhost:8080 if running page from file system
    const host = window.location.host || "localhost:8080";
    const socketUrl = `${protocol}${host}/ws/telemetry?token=${authToken}`;
    
    console.log(`Connecting WebSocket to: ${socketUrl}`);
    socket = new WebSocket(socketUrl);

    socket.onopen = () => {
        console.log("WebSocket connected to VoltHome telemetry stream.");
    };

    socket.onmessage = (event) => {
        try {
            const liveState = JSON.parse(event.data);
            
            // Map dynamic Ignite model properties to matching REST API objects
            const homeId = liveState.homeId;
            const index = homesList.findIndex(h => h.id === homeId);
            
            const updatedHome = {
                id: homeId,
                name: liveState.name,
                contactEmail: liveState.contactEmail,
                budgetQuota: liveState.budgetQuota,
                currentBalance: liveState.cumulativeCost,
                cumulativeEnergyKwh: liveState.cumulativeEnergyKwh,
                isPenaltyTariff: liveState.isPenaltyTariff,
                tariffRate: liveState.tariffRate,
                appliances: Object.values(liveState.appliances)
            };

            if (index !== -1) {
                homesList[index] = updatedHome;
            } else {
                homesList.push(updatedHome);
            }

            // Refresh UI grids dynamically with Zero Polling Overhead!
            renderHomesGrid();
            calculateGlobalStats();

            // If details modal is open for this specific home, update it in real time
            if (activeHomeId === homeId) {
                updateHomeDetailsFromData(liveState);
            }
        } catch (err) {
            console.error("Error processing streaming WebSocket message:", err);
        }
    };

    socket.onclose = () => {
        console.warn("WebSocket closed. Attempting reconnect in 3 seconds...");
        setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (err) => {
        console.error("WebSocket error:", err);
    };
}

// Fetch all registered homes from PostgreSQL
async function fetchHomes() {
    try {
        const res = await fetch(API_BASE, { headers: getHeaders() });
        if (res.status === 401 || res.status === 403) {
            handleLogout();
            return;
        }
        if (!res.ok) throw new Error("Ev listesi alınamadı");
        
        homesList = await res.json();
        
        document.getElementById("homes-loading").classList.add("hidden");
        
        if (homesList.length === 0) {
            document.getElementById("homes-empty").classList.remove("hidden");
            document.getElementById("homes-grid").classList.add("hidden");
            updateDashboardStats(0, 0, 0);
        } else {
            document.getElementById("homes-empty").classList.add("hidden");
            document.getElementById("homes-grid").classList.remove("hidden");
            renderHomesGrid();
            calculateGlobalStats();
        }
    } catch (err) {
        console.error("Dashboard fetch error:", err);
        showToast("Sunucu Bağlantı Hatası", "Backend API sunucusuna bağlanılamadı. Lütfen VoltHome Core servisinin çalıştığından emin olun.", "danger");
    }
}

// Render Homes Grid on Main Panel
function renderHomesGrid() {
    const grid = document.getElementById("homes-grid");
    grid.innerHTML = "";
    
    homesList.forEach(home => {
        const quota = home.budgetQuota;
        const balance = home.currentBalance || 0;
        const ratio = quota > 0 ? (balance / quota) * 100 : 0;
        
        let statusClass = "";
        let badgeClass = "badge-blue";
        let badgeText = "Normal";
        let progressClass = "blue";
        
        if (balance >= quota) {
            statusClass = "status-danger";
            badgeClass = "badge-red";
            badgeText = "100% Aşım / Cezalı";
            progressClass = "red";
            
            // Client side alert check
            triggerClientWarningToast(home.id, home.name, "100% Bütçe Aşımı", "Ev kotayı aşarak premium cezalı tarifeye geçti!", "danger", "warning100");
        } else if (balance >= quota * 0.8) {
            statusClass = "status-warning";
            badgeClass = "badge-orange";
            badgeText = "80% Limit Aşımı";
            progressClass = "orange";
            
            triggerClientWarningToast(home.id, home.name, "80% Bütçe Sınırı", "Ev bütçe limitinin %80'ine ulaştı. Tasarruf önerilerini kontrol edin.", "warning", "warning80");
        }

        const card = document.createElement("div");
        card.className = `home-card glass-panel ${statusClass}`;
        card.setAttribute("onclick", `openHomeDetailModal(${home.id})`);
        
        card.innerHTML = `
            <div class="home-card-header">
                <div class="home-title-block">
                    <h3>${escapeHtml(home.name)}</h3>
                    <span><i class="fa-regular fa-envelope"></i> ${escapeHtml(home.contactEmail)}</span>
                </div>
                <span class="badge ${badgeClass}">${badgeText}</span>
            </div>
            
            <div class="home-card-budget">
                <div class="budget-info">
                    <span>Mevcut Fatura</span>
                    <span class="budget-ratio">${ratio.toFixed(1)}%</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill ${progressClass}" style="width: ${Math.min(ratio, 100)}%"></div>
                </div>
                <div class="budget-info" style="margin-top: 4px; font-size: 11px; color: var(--text-muted);">
                    <span>${balance.toFixed(2)} TL</span>
                    <span>Kota: ${quota} TL</span>
                </div>
            </div>
            
            <div class="home-card-metrics">
                <div class="mini-metric">
                    <span>Cihaz Sayısı</span>
                    <strong>${home.appliances ? home.appliances.length : 0}</strong>
                </div>
                <div class="mini-metric">
                    <span>Toplam Enerji</span>
                    <strong>${(home.cumulativeEnergyKwh || 0).toFixed(3)} kWh</strong>
                </div>
                <div class="mini-metric">
                    <span>Tarife Birim</span>
                    <strong>${(home.tariffRate || 2.5).toFixed(2)} TL</strong>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

// Calculate Global Metrics
function calculateGlobalStats() {
    let totalHomes = homesList.length;
    let totalEnergy = 0;
    let totalCost = 0;
    
    homesList.forEach(h => {
        totalEnergy += (h.cumulativeEnergyKwh || 0);
        totalCost += (h.currentBalance || 0);
    });
    
    updateDashboardStats(totalHomes, totalEnergy, totalCost);
}

function updateDashboardStats(total, energy, cost) {
    document.getElementById("stat-total-homes").textContent = total;
    document.getElementById("stat-total-energy").textContent = `${energy.toFixed(2)} kWh`;
    document.getElementById("stat-total-cost").textContent = `${cost.toFixed(2)} TL`;
}

// Add appliance row in registration form
function addApplianceRow() {
    const list = document.getElementById("appliances-list");
    const row = document.createElement("div");
    row.className = "appliance-row";
    row.innerHTML = `
        <input type="text" class="app-name" placeholder="Cihaz Adı (Örn: Çamaşır Makinesi)" required>
        <select class="app-type">
            <option value="WASHING_MACHINE">Çamaşır Makinesi</option>
            <option value="REFRIGERATOR">Buzdolabı</option>
            <option value="AC">Klima (AC)</option>
            <option value="HEATER">Isıtıcı</option>
            <option value="TELEVISION">Televizyon</option>
            <option value="OTHER">Diğer</option>
        </select>
        <input type="number" class="app-limit" placeholder="Limit (W) Örn: 1500" min="10" required>
        <button type="button" class="btn-remove-row" onclick="removeApplianceRow(this)">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    `;
    list.appendChild(row);
}

function removeApplianceRow(button) {
    const row = button.closest(".appliance-row");
    const list = document.getElementById("appliances-list");
    if (list.children.length > 1) {
        row.remove();
    } else {
        showToast("Uyarı", "Ev kaydetmek için en az 1 adet cihaz eklemelisiniz.", "warning");
    }
}

// Handle Add Home Submit
async function handleAddHomeSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById("home-name").value;
    const contactEmail = document.getElementById("home-email").value;
    const budgetQuota = parseFloat(document.getElementById("home-quota").value);
    
    const applianceRows = document.querySelectorAll("#appliances-list .appliance-row");
    const appliances = [];
    
    applianceRows.forEach(row => {
        appliances.push({
            name: row.querySelector(".app-name").value,
            type: row.querySelector(".app-type").value,
            safeLimitWatt: parseFloat(row.querySelector(".app-limit").value)
        });
    });
    
    const payload = { name, contactEmail, budgetQuota, appliances };
    
    try {
        const res = await fetch(API_BASE, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        
        if (res.status === 401 || res.status === 403) {
            handleLogout();
            return;
        }
        if (!res.ok) throw new Error("Ev kaydedilirken bir hata oluştu");
        
        showToast("Başarılı", "Ev kaydı başarıyla oluşturuldu ve telemetri başlatıldı.", "success");
        closeAddHomeModal();
        fetchHomes();
    } catch (err) {
        showToast("İşlem Başarısız", err.message, "danger");
    }
}

// Modal open/close actions
function openAddHomeModal() {
    document.getElementById("modal-add-home").classList.remove("hidden");
    // Clear form
    document.getElementById("form-add-home").reset();
    const list = document.getElementById("appliances-list");
    list.innerHTML = "";
    // Re-add default appliance row
    addApplianceRow();
}

function closeAddHomeModal() {
    document.getElementById("modal-add-home").classList.add("hidden");
}

// Open Home Detail & Monitoring Modal
async function openHomeDetailModal(id) {
    activeHomeId = id;
    document.getElementById("modal-home-detail").classList.remove("hidden");
    
    // Clear previous AI content and show loader
    document.getElementById("ai-content-box").textContent = "";
    document.getElementById("ai-loading").classList.remove("hidden");
    
    // One-off load for AI recommendations, chart data, and initial state
    await updateHomeDetails();
    await fetchAndDrawTrendChart(id);
    await fetchPrediction(id);
    await fetchAutomationRules(id);
}

// Fetch month-end prediction
async function fetchPrediction(homeId) {
    try {
        const res = await fetch(`/api/homes/${homeId}/prediction`, { headers: getHeaders() });
        if (!res.ok) return;
        const p = await res.json();
        
        document.getElementById("pred-kwh").textContent = `${p.predictedKwh} kWh`;
        document.getElementById("pred-cost").textContent = `${p.predictedCost} TL`;
        document.getElementById("pred-quota").textContent = `${p.budgetQuota} TL`;
        document.getElementById("pred-days-remaining").textContent = `${p.daysRemaining} gün`;
        document.getElementById("pred-tariff-label").textContent = p.currentTariffLabel || "-";
        document.getElementById("pred-overshoot").textContent = p.overshootPercent > 0 
            ? `+${p.overshootPercent}% aşım` 
            : `${p.overshootPercent}% tasarruf`;
        
        const badge = document.getElementById("prediction-status-badge");
        if (p.budgetStatus === "OK") {
            badge.textContent = "✅ Bütçe Yeterli";
            badge.className = "badge badge-blue";
        } else if (p.budgetStatus === "WARNING") {
            badge.textContent = "⚠️ Yaklaşıyor";
            badge.className = "badge badge-orange";
        } else {
            badge.textContent = "🚨 Bütçe Aşılacak!";
            badge.className = "badge badge-red";
        }
    } catch (err) {
        console.error("Prediction fetch error:", err);
    }
}

// Load automation rules for the active home
async function fetchAutomationRules(homeId) {
    try {
        const res = await fetch(`/api/homes/${homeId}/rules`, { headers: getHeaders() });
        if (!res.ok) return;
        const rules = await res.json();
        renderAutomationRules(rules);
    } catch (err) {
        console.error("Automation rules fetch error:", err);
    }
}

function renderAutomationRules(rules) {
    const list = document.getElementById("automation-rules-list");
    list.innerHTML = "";
    
    if (rules.length === 0) {
        list.innerHTML = `<p class="rules-empty">Henüz otomasyon kuralı eklenmedi.</p>`;
        return;
    }
    
    const triggerLabels = {
        "ANOMALY": "Anomali Tespitinde",
        "BUDGET_80": "Bütçe %80 Aşımında",
        "BUDGET_100": "Bütçe %100 Aşımında",
        "WATTAGE_EXCEED": "Watt Aşımında"
    };
    const actionLabels = {
        "SHUTDOWN": "⚡ Kapat",
        "LOG_ONLY": "📋 Kaydet"
    };
    
    rules.forEach(rule => {
        const row = document.createElement("div");
        row.className = `rule-row ${rule.enabled ? "" : "rule-disabled"}`;
        row.innerHTML = `
            <div class="rule-info">
                <span class="rule-tag">${escapeHtml(rule.deviceType === "*" ? "Tüm Cihazlar" : rule.deviceType)}</span>
                <span class="rule-trigger">${triggerLabels[rule.triggerType] || rule.triggerType}${rule.triggerValue ? ` (${rule.triggerValue}W)` : ""}</span>
                <span class="rule-arrow">→</span>
                <span class="rule-action">${actionLabels[rule.action] || rule.action}</span>
            </div>
            <div class="rule-controls">
                <button class="btn btn-sm ${rule.enabled ? "btn-secondary" : "btn-primary"}" 
                        onclick="toggleRule(${activeHomeId}, ${rule.id})" title="${rule.enabled ? "Devre Dışı Bırak" : "Etkinleştir"}">
                    <i class="fa-solid ${rule.enabled ? "fa-toggle-on" : "fa-toggle-off"}"></i>
                </button>
                <button class="btn btn-sm btn-danger-sm" onclick="deleteRule(${activeHomeId}, ${rule.id})" title="Sil">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        list.appendChild(row);
    });
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
    if (!activeHomeId) return;
    const deviceType = document.getElementById("rule-device-type").value;
    const triggerType = document.getElementById("rule-trigger-type").value;
    const triggerValueEl = document.getElementById("rule-trigger-value");
    const triggerValue = triggerType === "WATTAGE_EXCEED" ? parseFloat(triggerValueEl.value) : null;
    const action = document.getElementById("rule-action").value;
    
    try {
        const res = await fetch(`/api/homes/${activeHomeId}/rules`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ deviceType, triggerType, triggerValue, action })
        });
        if (!res.ok) throw new Error("Kural kaydedilemedi");
        showToast("Otomasyon Kuralı", "Kural başarıyla eklendi.", "success");
        closeAddRuleForm();
        await fetchAutomationRules(activeHomeId);
    } catch (err) {
        showToast("Hata", err.message, "danger");
    }
};

window.toggleRule = async function(homeId, ruleId) {
    try {
        await fetch(`/api/homes/${homeId}/rules/${ruleId}/toggle`, {
            method: "PATCH", headers: getHeaders()
        });
        await fetchAutomationRules(homeId);
    } catch (err) {
        showToast("Hata", "Kural güncellenemedi.", "danger");
    }
};

window.deleteRule = async function(homeId, ruleId) {
    try {
        await fetch(`/api/homes/${homeId}/rules/${ruleId}`, {
            method: "DELETE", headers: getHeaders()
        });
        showToast("Silindi", "Otomasyon kuralı kaldırıldı.", "info");
        await fetchAutomationRules(homeId);
    } catch (err) {
        showToast("Hata", "Kural silinemedi.", "danger");
    }
};


function closeHomeDetailModal() {
    document.getElementById("modal-home-detail").classList.add("hidden");
    activeHomeId = null;
}

// Poll & Update live status inside details modal
async function updateHomeDetails() {
    if (!activeHomeId) return;
    
    try {
        const res = await fetch(`${API_BASE}/${activeHomeId}/status`, { headers: getHeaders() });
        if (res.status === 401 || res.status === 403) {
            handleLogout();
            return;
        }
        if (!res.ok) throw new Error("Canlı durum bilgisi alınamadı");
        
        const data = await res.json();
        const liveState = data.liveState;
        const recommendation = data.latestAIRecommendation;
        
        // Update Title & Metadata
        document.getElementById("detail-home-name").textContent = liveState.name;
        document.getElementById("detail-home-email").innerHTML = `<i class="fa-regular fa-envelope"></i> ${liveState.contactEmail}`;
        document.getElementById("detail-quota-badge").textContent = `Bütçe Kotası: ${liveState.budgetQuota} TL`;
        
        // Update live metrics
        document.getElementById("detail-cumulative-energy").textContent = `${liveState.cumulativeEnergyKwh.toFixed(4)} kWh`;
        document.getElementById("detail-cumulative-cost").textContent = `${liveState.cumulativeCost.toFixed(2)} TL`;
        document.getElementById("detail-tariff-rate").textContent = `${liveState.tariffRate.toFixed(2)} TL/kWh`;
        
        // Update Tariff Status Badge
        const statusWrapper = document.getElementById("detail-tariff-status");
        if (liveState.isPenaltyTariff) {
            statusWrapper.innerHTML = `<span class="badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i> Cezalı Tarife</span>`;
        } else {
            statusWrapper.innerHTML = `<span class="badge badge-blue"><i class="fa-solid fa-shield-halved"></i> Normal Tarife</span>`;
        }
        
        // Update AI Advice Box
        document.getElementById("ai-loading").classList.add("hidden");
        document.getElementById("ai-content-box").textContent = recommendation;
        
        // Render Appliance Grid
        renderLiveAppliances(liveState.appliances, liveState.name);
        
    } catch (err) {
        console.error("Telemetry poll error:", err);
    }
}

// Update live status inside details modal using streamed WebSocket data
function updateHomeDetailsFromData(liveState) {
    if (!activeHomeId) return;
    
    // Update Title & Metadata
    document.getElementById("detail-home-name").textContent = liveState.name;
    document.getElementById("detail-home-email").innerHTML = `<i class="fa-regular fa-envelope"></i> ${liveState.contactEmail}`;
    document.getElementById("detail-quota-badge").textContent = `Bütçe Kotası: ${liveState.budgetQuota} TL`;
    
    // Update live metrics
    document.getElementById("detail-cumulative-energy").textContent = `${liveState.cumulativeEnergyKwh.toFixed(4)} kWh`;
    document.getElementById("detail-cumulative-cost").textContent = `${liveState.cumulativeCost.toFixed(2)} TL`;
    document.getElementById("detail-tariff-rate").textContent = `${liveState.tariffRate.toFixed(2)} TL/kWh`;
    
    // Update Tariff Status Badge
    const statusWrapper = document.getElementById("detail-tariff-status");
    if (liveState.isPenaltyTariff) {
        statusWrapper.innerHTML = `<span class="badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i> Cezalı Tarife</span>`;
    } else {
        statusWrapper.innerHTML = `<span class="badge badge-blue"><i class="fa-solid fa-shield-halved"></i> Normal Tarife</span>`;
    }
    
    // Render Appliance Grid dynamically
    renderLiveAppliances(liveState.appliances, liveState.name);
}

// Render Appliance Cards inside detailed view
function renderLiveAppliances(appliancesMap, homeName) {
    const grid = document.getElementById("detail-appliances-grid");
    grid.innerHTML = "";
    
    const appliances = Object.values(appliancesMap);
    
    appliances.forEach(app => {
        const current = app.currentWatt || 0;
        const limit = app.safeLimitWatt;
        const ratio = limit > 0 ? (current / limit) * 100 : 0;
        
        let cardStatusClass = "";
        let wattClass = "normal";
        let gaugeClass = "blue";
        let alertBadge = "";
        
        if (app.isAnomalous) {
            cardStatusClass = "status-danger";
            wattClass = "breached";
            gaugeClass = "red";
            alertBadge = `<span class="badge badge-red"><i class="fa-solid fa-circle-radiation"></i> Anomali</span>`;
            
            // Client side toast alert
            const alertKey = `${activeHomeId}_${app.id}`;
            triggerClientWarningToast(alertKey, homeName, `Cihaz Anomalisi: ${app.name}`, `${app.name} safe limiti (${limit}W) 3 kez üst üste aşarak anomalili işaretlendi! Mevcut Güç: ${current.toFixed(1)}W`, "danger", "anomalies");
        } else if (current > limit) {
            // Instant breach, not yet anomalous (less than 3 cycles)
            wattClass = "breached";
            gaugeClass = "red";
            alertBadge = `<span class="badge badge-orange"><i class="fa-solid fa-triangle-exclamation"></i> Limit Aşımı</span>`;
        } else {
            alertBadge = `<span class="badge badge-blue"><i class="fa-solid fa-circle-check"></i> Güvenli</span>`;
        }
        
        const appCard = document.createElement("div");
        appCard.className = `live-appliance-card glass-panel ${cardStatusClass}`;
        appCard.innerHTML = `
            <div class="appliance-info-row">
                <div class="appliance-meta">
                    <h4>${escapeHtml(app.name)}</h4>
                    <span>Cihaz Tipi: ${escapeHtml(app.type)}</span>
                </div>
                <div class="appliance-watt-display">
                    <span class="watt-number ${wattClass}">${current.toFixed(1)} W</span>
                    <span class="watt-label">Anlık Tüketim</span>
                </div>
            </div>
            
            <div class="appliance-gauge">
                <div class="gauge-fill ${gaugeClass}" style="width: ${Math.min(ratio, 100)}%"></div>
            </div>
            
            <div class="appliance-info-row" style="margin-bottom: 0;">
                <div class="appliance-limits">
                    <span>Limit: ${limit} W</span>
                </div>
                ${alertBadge}
            </div>
        `;
        
        grid.appendChild(appCard);
    });
}

// Fetch trend data and draw Chart.js graph
async function fetchAndDrawTrendChart(homeId) {
    try {
        const res = await fetch(`${API_BASE}/${homeId}/trends`, { headers: getHeaders() });
        if (res.status === 401 || res.status === 403) {
            handleLogout();
            return;
        }
        if (!res.ok) throw new Error("Trend verileri alınamadı");
        
        const data = await res.json();
        
        const labels = data.map(item => {
            const date = new Date(item.recordedAt);
            return date.toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        });
        
        const costData = data.map(item => item.totalCost);
        const energyData = data.map(item => item.totalKwh);
        
        const ctx = document.getElementById("chart-consumption-trends").getContext("2d");
        
        if (chartInstance) {
            chartInstance.destroy();
        }
        
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Fatura Tutarı (TL)',
                        data: costData,
                        borderColor: '#ff9100',
                        backgroundColor: 'rgba(255, 145, 0, 0.05)',
                        borderWidth: 2,
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Enerji Tüketimi (kWh)',
                        data: energyData,
                        borderColor: '#00e5ff',
                        backgroundColor: 'rgba(0, 229, 255, 0.05)',
                        borderWidth: 2,
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#8e8e9f', font: { family: 'Outfit', size: 11 } }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.03)' },
                        ticks: { color: '#8e8e9f', font: { family: 'Outfit', size: 9 } }
                    },
                    y: {
                        position: 'left',
                        grid: { color: 'rgba(255, 255, 255, 0.03)' },
                        ticks: { color: '#ff9100' },
                        title: { display: true, text: 'TL', color: '#ff9100', font: { family: 'Outfit', size: 10 } }
                    },
                    y1: {
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#00e5ff' },
                        title: { display: true, text: 'kWh', color: '#00e5ff', font: { family: 'Outfit', size: 10 } }
                    }
                }
            }
        });
    } catch (err) {
        console.error("Trend chart load error:", err);
    }
}

// Manually trigger LLM Prompt Generation
async function triggerManualAIRecommendation() {
    if (!activeHomeId) return;
    
    document.getElementById("ai-content-box").textContent = "";
    document.getElementById("ai-loading").classList.remove("hidden");
    
    try {
        const res = await fetch(`${API_BASE}/${activeHomeId}/trigger-ai`, { 
            method: "POST",
            headers: getHeaders()
        });
        if (res.status === 401 || res.status === 403) {
            handleLogout();
            return;
        }
        if (!res.ok) throw new Error("Yapay zeka tetiklenemedi");
        
        const data = await res.json();
        showToast("AI Tetiklendi", data.status, "success");
        
        // Wait a few seconds and refresh status to fetch the generated response
        setTimeout(updateHomeDetails, 3000);
    } catch (err) {
        showToast("İşlem Başarısız", err.message, "danger");
        document.getElementById("ai-loading").classList.add("hidden");
    }
}

// Client-Side Warning Toaster logic to prevent alert flood
function triggerClientWarningToast(key, name, title, body, type, alertMapKey) {
    if (!triggeredClientAlerts[alertMapKey][key]) {
        triggeredClientAlerts[alertMapKey][key] = true;
        showToast(`[${name}] ${title}`, body, type);
    }
}

// Show dynamic Toast notification
function showToast(title, body, type = "info") {
    const container = document.getElementById("toast-container");
    
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let icon = "fa-circle-info";
    if (type === "danger") icon = "fa-circle-exclamation";
    if (type === "warning") icon = "fa-triangle-exclamation";
    if (type === "success") icon = "fa-circle-check";
    
    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="toast-body">
            <h5>${escapeHtml(title)}</h5>
            <p>${escapeHtml(body)}</p>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Automatically remove after 6 seconds
    setTimeout(() => {
        toast.style.animation = "toast-slide-in 0.3s reverse forwards";
        setTimeout(() => toast.remove(), 300);
    }, 6000);
}

// Utility to escape HTML variables for security
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}
