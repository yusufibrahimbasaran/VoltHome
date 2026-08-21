// VoltHome Client-Side SPA Engine
const API_BASE = "http://localhost:8080/api/homes";
let homesList = [];
let activeHomeId = null;
let detailPollInterval = null;
let dashboardPollInterval = null;
let chartInstance = null;

// Track previously seen warnings to prevent spamming notifications on client side
const triggeredClientAlerts = {
    warning80: {},
    warning100: {},
    anomalies: {}
};

document.addEventListener("DOMContentLoaded", () => {
    // Initial load
    fetchHomes();
    
    // Start quiet background dashboard polling
    dashboardPollInterval = setInterval(fetchHomes, 5000);

    // Event Bindings
    document.getElementById("btn-open-add-home").addEventListener("click", openAddHomeModal);
    document.getElementById("btn-add-appliance-row").addEventListener("click", addApplianceRow);
    document.getElementById("form-add-home").addEventListener("submit", handleAddHomeSubmit);
});

// Fetch all registered homes from PostgreSQL
async function fetchHomes() {
    try {
        const res = await fetch(API_BASE);
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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
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
    
    // Initial fetch of details and chart
    await updateHomeDetails();
    await fetchAndDrawTrendChart(id);
    
    // Set fast interval polling for live telemetry status (2 seconds)
    if (detailPollInterval) clearInterval(detailPollInterval);
    detailPollInterval = setInterval(updateHomeDetails, 2000);
}

function closeHomeDetailModal() {
    document.getElementById("modal-home-detail").classList.add("hidden");
    if (detailPollInterval) {
        clearInterval(detailPollInterval);
        detailPollInterval = null;
    }
    activeHomeId = null;
}

// Poll & Update live status inside details modal
async function updateHomeDetails() {
    if (!activeHomeId) return;
    
    try {
        const res = await fetch(`${API_BASE}/${activeHomeId}/status`);
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
        const res = await fetch(`${API_BASE}/${homeId}/trends`);
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
        const res = await fetch(`${API_BASE}/${activeHomeId}/trigger-ai`, { method: "POST" });
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
