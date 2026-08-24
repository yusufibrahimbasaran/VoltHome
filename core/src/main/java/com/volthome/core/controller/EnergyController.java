package com.volthome.core.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.volthome.core.config.KafkaConfig;
import com.volthome.core.model.ignite.HomeLiveState;
import com.volthome.core.model.jpa.AutomationRule;
import com.volthome.core.model.jpa.EventLog;
import com.volthome.core.model.jpa.Home;
import com.volthome.core.model.jpa.TariffSchedule;
import com.volthome.core.repository.AutomationRuleRepository;
import com.volthome.core.repository.EventLogRepository;
import com.volthome.core.service.HomeService;
import com.volthome.core.service.PredictionService;
import com.volthome.core.service.TariffService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@RestController
@CrossOrigin(origins = "*")
@Tag(name = "Energy Intelligence", description = "Dynamic tariff engine, month-end predictions, invoices, switch controls, and IoT automation rules")
public class EnergyController {

    private final TariffService tariffService;
    private final PredictionService predictionService;
    private final HomeService homeService;
    private final AutomationRuleRepository automationRuleRepository;
    private final EventLogRepository eventLogRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Autowired
    public EnergyController(TariffService tariffService,
                            PredictionService predictionService,
                            HomeService homeService,
                            AutomationRuleRepository automationRuleRepository,
                            EventLogRepository eventLogRepository,
                            KafkaTemplate<String, String> kafkaTemplate,
                            ObjectMapper objectMapper) {
        this.tariffService = tariffService;
        this.predictionService = predictionService;
        this.homeService = homeService;
        this.automationRuleRepository = automationRuleRepository;
        this.eventLogRepository = eventLogRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
    }

    // ─── Remote Switch Control (Kafka volthome-commands) ───────────────────────

    @PostMapping("/api/homes/{homeId}/appliances/{applianceId}/toggle")
    @Operation(summary = "Remote device switch toggle", description = "Dispatches a TOGGLE/TURN_ON/TURN_OFF command to the IoT sensor simulator via Kafka")
    public ResponseEntity<Map<String, Object>> toggleApplianceSwitch(@PathVariable Long homeId,
                                                                     @PathVariable Long applianceId,
                                                                     @RequestBody(required = false) Map<String, String> payload) {
        try {
            String username = getUsername();
            Home home = homeService.getHomeById(homeId);
            if (home == null || home.getUser() == null || !home.getUser().getUsername().equals(username)) {
                return ResponseEntity.status(403).build();
            }

            String action = (payload != null && payload.containsKey("action")) ? payload.get("action") : "TOGGLE";

            Map<String, Object> command = new HashMap<>();
            command.put("command", action);
            command.put("homeId", homeId);
            command.put("applianceId", applianceId);
            command.put("reason", "Kullanici arayuzunden manuel uzaktan anahtar kontrolu (" + action + ")");
            command.put("timestamp", LocalDateTime.now().toString());

            String json = objectMapper.writeValueAsString(command);
            kafkaTemplate.send(KafkaConfig.COMMANDS_TOPIC, json);

            Map<String, Object> response = new HashMap<>();
            response.put("status", "SUCCESS");
            response.put("message", "Cihaz kontrol komutu IoT simulatorune iletildi.");
            response.put("command", action);
            response.put("homeId", homeId);
            response.put("applianceId", applianceId);

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    // ─── Invoices & Billing Statements ─────────────────────────────────────────

    @GetMapping("/api/homes/{id}/invoices")
    @Operation(summary = "Get billing & invoice statements", description = "Generates itemized EPDK multi-tariff electricity bills and statements for the home")
    public ResponseEntity<Map<String, Object>> getHomeInvoices(@PathVariable Long id) {
        try {
            String username = getUsername();
            Home home = homeService.getHomeById(id);
            if (home == null || home.getUser() == null || !home.getUser().getUsername().equals(username)) {
                return ResponseEntity.status(403).build();
            }

            HomeLiveState liveState = homeService.getLiveStatus(id);
            double currentKwh = (liveState != null && liveState.getCumulativeEnergyKwh() != null) ? liveState.getCumulativeEnergyKwh() : 0.0;
            double currentCost = (liveState != null && liveState.getCumulativeCost() != null) ? liveState.getCumulativeCost() : 0.0;

            // Compute current active month bill
            double energyCost = Math.round(currentCost * 100.0) / 100.0;
            double distributionCost = Math.round(currentKwh * 0.85 * 100.0) / 100.0;
            double energyFund = Math.round(energyCost * 0.01 * 100.0) / 100.0;
            double trtTax = Math.round(energyCost * 0.02 * 100.0) / 100.0;
            double subTotal = energyCost + distributionCost + energyFund + trtTax;
            double kdv = Math.round(subTotal * 0.20 * 100.0) / 100.0;
            double totalBill = Math.round((subTotal + kdv) * 100.0) / 100.0;

            Map<String, Object> currentBill = new LinkedHashMap<>();
            currentBill.put("period", "Agustos 2026 (Guncel Donem)");
            currentBill.put("invoiceNo", "VOLT-2026-08-" + String.format("%04d", id));
            currentBill.put("status", "GUNCEL");
            currentBill.put("totalKwh", Math.round(currentKwh * 100.0) / 100.0);
            currentBill.put("dayKwh", Math.round(currentKwh * 0.65 * 100.0) / 100.0);
            currentBill.put("nightKwh", Math.round(currentKwh * 0.35 * 100.0) / 100.0);
            currentBill.put("energyCost", energyCost);
            currentBill.put("distributionCost", distributionCost);
            currentBill.put("energyFund", energyFund);
            currentBill.put("trtTax", trtTax);
            currentBill.put("kdv", kdv);
            currentBill.put("totalAmount", totalBill);
            currentBill.put("dueDate", "15.09.2026");

            // Historical archived statements
            List<Map<String, Object>> archivedInvoices = new ArrayList<>();

            Map<String, Object> inv1 = new LinkedHashMap<>();
            inv1.put("period", "Temmuz 2026");
            inv1.put("invoiceNo", "VOLT-2026-07-" + String.format("%04d", id));
            inv1.put("status", "ODENDI");
            inv1.put("totalKwh", 248.5);
            inv1.put("dayKwh", 162.0);
            inv1.put("nightKwh", 86.5);
            inv1.put("energyCost", 845.20);
            inv1.put("distributionCost", 211.20);
            inv1.put("energyFund", 8.45);
            inv1.put("trtTax", 16.90);
            inv1.put("kdv", 216.35);
            inv1.put("totalAmount", 1298.10);
            inv1.put("dueDate", "15.08.2026");
            inv1.put("paidDate", "12.08.2026");
            archivedInvoices.add(inv1);

            Map<String, Object> inv2 = new LinkedHashMap<>();
            inv2.put("period", "Haziran 2026");
            inv2.put("invoiceNo", "VOLT-2026-06-" + String.format("%04d", id));
            inv2.put("status", "ODENDI");
            inv2.put("totalKwh", 215.2);
            inv2.put("dayKwh", 139.8);
            inv2.put("nightKwh", 75.4);
            inv2.put("energyCost", 732.10);
            inv2.put("distributionCost", 182.90);
            inv2.put("energyFund", 7.32);
            inv2.put("trtTax", 14.64);
            inv2.put("kdv", 187.40);
            inv2.put("totalAmount", 1124.36);
            inv2.put("dueDate", "15.07.2026");
            inv2.put("paidDate", "10.07.2026");
            archivedInvoices.add(inv2);

            Map<String, Object> result = new HashMap<>();
            result.put("homeName", home.getName());
            result.put("customerName", (home.getUser() != null) ? home.getUser().getUsername() : "VoltHome Abonesi");
            result.put("customerEmail", home.getContactEmail());
            result.put("currentBill", currentBill);
            result.put("archivedBills", archivedInvoices);
            result.put("tariffType", "EPDK Cok Zamanli Akilli Tarife (Gunduz 3.85 TL / Gece 2.10 TL)");

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    // ─── Notification Inbox ───────────────────────────────────────────────────

    @GetMapping("/api/notifications")
    @Operation(summary = "Get user notifications", description = "Lists alert notifications and event logs for user's smart homes")
    public ResponseEntity<List<Map<String, Object>>> getUserNotifications() {
        try {
            String username = getUsername();
            List<Home> userHomes = homeService.getAllHomes(username);
            List<Map<String, Object>> notifications = new ArrayList<>();

            for (Home home : userHomes) {
                List<EventLog> logs = eventLogRepository.findByHomeIdOrderByCreatedAtDesc(home.getId());
                for (EventLog log : logs) {
                    Map<String, Object> item = new HashMap<>();
                    item.put("id", log.getId());
                    item.put("homeId", home.getId());
                    item.put("homeName", home.getName());
                    item.put("eventType", log.getEventType());
                    item.put("description", log.getDescription());
                    item.put("createdAt", log.getCreatedAt().format(DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss")));
                    notifications.add(item);
                    if (notifications.size() >= 20) break; // Limit to 20
                }
                if (notifications.size() >= 20) break;
            }

            return ResponseEntity.ok(notifications);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    // ─── Tariff Engine ─────────────────────────────────────────────────────────

    @GetMapping("/api/tariff/current")
    @Operation(summary = "Get current tariff slot", description = "Returns the active time-of-use tariff rate for the current hour")
    public ResponseEntity<?> getCurrentTariff() {
        TariffSchedule t = tariffService.getCurrentTariff();
        if (t != null) return ResponseEntity.ok(t);
        return ResponseEntity.ok(Map.of("rate", tariffService.getCurrentRate(), "label", "Standart Tarife"));
    }

    @GetMapping("/api/tariff")
    @Operation(summary = "List all tariff slots", description = "Returns the full time-of-use tariff schedule ordered by hour")
    public ResponseEntity<List<TariffSchedule>> getAllTariffs() {
        return ResponseEntity.ok(tariffService.getAllTariffs());
    }

    // ─── Month-End Prediction ──────────────────────────────────────────────────

    @GetMapping("/api/homes/{id}/prediction")
    @Operation(summary = "Month-end cost prediction", description = "Statistically projects month-end energy consumption and cost using daily averages from live state")
    public ResponseEntity<Map<String, Object>> getMonthEndPrediction(@PathVariable Long id) {
        try {
            String username = getUsername();
            Home home = homeService.getHomeById(id);
            if (home == null || home.getUser() == null || !home.getUser().getUsername().equals(username)) {
                return ResponseEntity.status(403).build();
            }
            HomeLiveState liveState = homeService.getLiveStatus(id);
            Map<String, Object> prediction = predictionService.predictMonthEnd(id, liveState);
            return ResponseEntity.ok(prediction);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    // ─── Automation Rules ──────────────────────────────────────────────────────

    @GetMapping("/api/homes/{id}/rules")
    @Operation(summary = "List automation rules", description = "Returns all IoT automation rules for a home")
    public ResponseEntity<List<AutomationRule>> getRules(@PathVariable Long id) {
        String username = getUsername();
        Home home = homeService.getHomeById(id);
        if (home == null || home.getUser() == null || !home.getUser().getUsername().equals(username)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(automationRuleRepository.findByHomeId(id));
    }

    @PostMapping("/api/homes/{id}/rules")
    @Operation(summary = "Create automation rule", description = "Adds a new IoT automation rule for the home")
    public ResponseEntity<AutomationRule> createRule(@PathVariable Long id,
                                                      @RequestBody AutomationRule ruleRequest) {
        String username = getUsername();
        Home home = homeService.getHomeById(id);
        if (home == null || home.getUser() == null || !home.getUser().getUsername().equals(username)) {
            return ResponseEntity.status(403).build();
        }
        ruleRequest.setHome(home);
        ruleRequest.setCreatedAt(LocalDateTime.now());
        ruleRequest.setEnabled(true);
        AutomationRule saved = automationRuleRepository.save(ruleRequest);
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping("/api/homes/{homeId}/rules/{ruleId}")
    @Operation(summary = "Delete automation rule", description = "Removes an IoT automation rule")
    public ResponseEntity<Void> deleteRule(@PathVariable Long homeId, @PathVariable Long ruleId) {
        String username = getUsername();
        Home home = homeService.getHomeById(homeId);
        if (home == null || home.getUser() == null || !home.getUser().getUsername().equals(username)) {
            return ResponseEntity.status(403).build();
        }
        automationRuleRepository.deleteById(ruleId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/api/homes/{homeId}/rules/{ruleId}/toggle")
    @Operation(summary = "Toggle automation rule", description = "Enables or disables an automation rule")
    public ResponseEntity<AutomationRule> toggleRule(@PathVariable Long homeId, @PathVariable Long ruleId) {
        String username = getUsername();
        Home home = homeService.getHomeById(homeId);
        if (home == null || home.getUser() == null || !home.getUser().getUsername().equals(username)) {
            return ResponseEntity.status(403).build();
        }
        return automationRuleRepository.findById(ruleId).map(rule -> {
            rule.setEnabled(!rule.getEnabled());
            return ResponseEntity.ok(automationRuleRepository.save(rule));
        }).orElse(ResponseEntity.notFound().build());
    }

    // ─── Preset Smart Scenarios ────────────────────────────────────────────────

    @PostMapping("/api/homes/{homeId}/preset-scenarios")
    @Operation(summary = "Toggle preset smart scenario", description = "Synchronizes predefined smart scenarios with automation rules table")
    public ResponseEntity<Map<String, Object>> togglePresetScenario(@PathVariable Long homeId,
                                                                    @RequestBody Map<String, Object> payload) {
        String username = getUsername();
        Home home = homeService.getHomeById(homeId);
        if (home == null || home.getUser() == null || !home.getUser().getUsername().equals(username)) {
            return ResponseEntity.status(403).build();
        }

        String scenarioType = (String) payload.get("scenarioType");
        boolean enabled = Boolean.TRUE.equals(payload.get("enabled"));

        String triggerType;
        switch (scenarioType) {
            case "NIGHT_ECO":
                triggerType = "NIGHT_ECO";
                break;
            case "PEAK_TARIFF":
                triggerType = "PEAK_TARIFF";
                break;
            case "ANOMALY_SAFE":
                triggerType = "ANOMALY";
                break;
            case "BUDGET_80_LOCK":
                triggerType = "BUDGET_80";
                break;
            default:
                triggerType = scenarioType;
                break;
        }

        List<AutomationRule> existing = automationRuleRepository.findByHomeId(homeId);
        AutomationRule target = null;
        for (AutomationRule r : existing) {
            if (triggerType.equals(r.getTriggerType())) {
                target = r;
                break;
            }
        }

        if (target == null) {
            target = AutomationRule.builder()
                    .home(home)
                    .deviceType("*")
                    .triggerType(triggerType)
                    .action("SHUTDOWN")
                    .triggerValue(null)
                    .enabled(enabled)
                    .createdAt(LocalDateTime.now())
                    .build();
        } else {
            target.setEnabled(enabled);
        }
        automationRuleRepository.save(target);

        Map<String, Object> resp = new HashMap<>();
        resp.put("status", "SUCCESS");
        resp.put("scenarioType", scenarioType);
        resp.put("enabled", enabled);
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/api/homes/{homeId}/preset-scenarios")
    @Operation(summary = "Get preset smart scenario states", description = "Returns active state for preset smart scenarios")
    public ResponseEntity<Map<String, Boolean>> getPresetScenarios(@PathVariable Long homeId) {
        String username = getUsername();
        Home home = homeService.getHomeById(homeId);
        if (home == null || home.getUser() == null || !home.getUser().getUsername().equals(username)) {
            return ResponseEntity.status(403).build();
        }

        List<AutomationRule> existing = automationRuleRepository.findByHomeId(homeId);
        Map<String, Boolean> states = new HashMap<>();
        states.put("NIGHT_ECO", true);
        states.put("PEAK_TARIFF", true);
        states.put("ANOMALY_SAFE", true);
        states.put("BUDGET_80_LOCK", true);

        for (AutomationRule r : existing) {
            if ("NIGHT_ECO".equals(r.getTriggerType())) states.put("NIGHT_ECO", Boolean.TRUE.equals(r.getEnabled()));
            if ("PEAK_TARIFF".equals(r.getTriggerType())) states.put("PEAK_TARIFF", Boolean.TRUE.equals(r.getEnabled()));
            if ("ANOMALY".equals(r.getTriggerType())) states.put("ANOMALY_SAFE", Boolean.TRUE.equals(r.getEnabled()));
            if ("BUDGET_80".equals(r.getTriggerType())) states.put("BUDGET_80_LOCK", Boolean.TRUE.equals(r.getEnabled()));
        }

        return ResponseEntity.ok(states);
    }

    private String getUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth.getName();
    }
}
