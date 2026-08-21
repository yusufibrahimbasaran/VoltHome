package com.volthome.core.controller;

import com.volthome.core.model.ignite.HomeLiveState;
import com.volthome.core.model.jpa.AutomationRule;
import com.volthome.core.model.jpa.Home;
import com.volthome.core.model.jpa.TariffSchedule;
import com.volthome.core.repository.AutomationRuleRepository;
import com.volthome.core.service.HomeService;
import com.volthome.core.service.PredictionService;
import com.volthome.core.service.TariffService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@CrossOrigin(origins = "*")
@Tag(name = "Energy Intelligence", description = "Dynamic tariff engine, month-end predictions, and IoT automation rules")
public class EnergyController {

    private final TariffService tariffService;
    private final PredictionService predictionService;
    private final HomeService homeService;
    private final AutomationRuleRepository automationRuleRepository;

    @Autowired
    public EnergyController(TariffService tariffService,
                            PredictionService predictionService,
                            HomeService homeService,
                            AutomationRuleRepository automationRuleRepository) {
        this.tariffService = tariffService;
        this.predictionService = predictionService;
        this.homeService = homeService;
        this.automationRuleRepository = automationRuleRepository;
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
            if (home == null || !home.getUser().getUsername().equals(username)) {
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
        if (home == null || !home.getUser().getUsername().equals(username)) {
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
        if (home == null || !home.getUser().getUsername().equals(username)) {
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
        if (home == null || !home.getUser().getUsername().equals(username)) {
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
        if (home == null || !home.getUser().getUsername().equals(username)) {
            return ResponseEntity.status(403).build();
        }
        return automationRuleRepository.findById(ruleId).map(rule -> {
            rule.setEnabled(!rule.getEnabled());
            return ResponseEntity.ok(automationRuleRepository.save(rule));
        }).orElse(ResponseEntity.notFound().build());
    }

    private String getUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth.getName();
    }
}
