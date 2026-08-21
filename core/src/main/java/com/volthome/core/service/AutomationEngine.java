package com.volthome.core.service;

import com.volthome.core.config.KafkaConfig;
import com.volthome.core.model.ignite.ApplianceLiveState;
import com.volthome.core.model.ignite.HomeLiveState;
import com.volthome.core.model.jpa.AutomationRule;
import com.volthome.core.repository.AutomationRuleRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * AutomationEngine — evaluates user-defined automation rules against
 * the current live state after each telemetry event and dispatches
 * Kafka SHUTDOWN commands when conditions are met.
 */
@Service
public class AutomationEngine {
    private static final Logger log = LoggerFactory.getLogger(AutomationEngine.class);

    private final AutomationRuleRepository automationRuleRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Autowired
    public AutomationEngine(AutomationRuleRepository automationRuleRepository,
                            KafkaTemplate<String, String> kafkaTemplate,
                            ObjectMapper objectMapper) {
        this.automationRuleRepository = automationRuleRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Evaluate all enabled automation rules for a home after a telemetry event.
     * Triggered from TelemetryConsumerService on every Kafka message.
     */
    public void evaluate(Long homeId, HomeLiveState liveState) {
        List<AutomationRule> rules = automationRuleRepository.findByHomeIdAndEnabledTrue(homeId);
        if (rules.isEmpty()) return;

        for (AutomationRule rule : rules) {
            try {
                boolean triggered = matchesRule(rule, liveState);
                if (triggered) {
                    executeAction(rule, homeId, liveState);
                }
            } catch (Exception e) {
                log.error("Error evaluating rule {} for home {}: {}", rule.getId(), homeId, e.getMessage());
            }
        }
    }

    private boolean matchesRule(AutomationRule rule, HomeLiveState liveState) {
        switch (rule.getTriggerType()) {
            case "BUDGET_80":
                return liveState.getWarning80Triggered();
            case "BUDGET_100":
                return liveState.getWarning100Triggered();
            case "ANOMALY":
                return liveState.getAppliances().values().stream()
                        .anyMatch(app -> matchesDeviceType(rule.getDeviceType(), app) 
                                        && Boolean.TRUE.equals(app.getIsAnomalous()));
            case "WATTAGE_EXCEED":
                if (rule.getTriggerValue() == null) return false;
                return liveState.getAppliances().values().stream()
                        .anyMatch(app -> matchesDeviceType(rule.getDeviceType(), app)
                                        && app.getCurrentWatt() > rule.getTriggerValue());
            default:
                return false;
        }
    }

    private boolean matchesDeviceType(String ruleType, ApplianceLiveState app) {
        return "*".equals(ruleType) || ruleType.equalsIgnoreCase(app.getType());
    }

    private void executeAction(AutomationRule rule, Long homeId, HomeLiveState liveState) {
        if ("SHUTDOWN".equals(rule.getAction())) {
            liveState.getAppliances().values().stream()
                    .filter(app -> matchesDeviceType(rule.getDeviceType(), app))
                    .filter(app -> app.getCurrentWatt() > 0)
                    .forEach(app -> sendShutdownCommand(homeId, app.getId(), app.getName(), 
                            "Otomasyon kuralı tetiklendi: " + rule.getTriggerType()));
        } else if ("LOG_ONLY".equals(rule.getAction())) {
            log.info("Automation rule {} triggered for home {} — LOG_ONLY (no command sent)", 
                     rule.getId(), homeId);
        }
    }

    private void sendShutdownCommand(Long homeId, Long applianceId, String applianceName, String reason) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("homeId", homeId);
            payload.put("applianceId", applianceId);
            payload.put("command", "SHUTDOWN");
            payload.put("reason", reason);
            String json = objectMapper.writeValueAsString(payload);
            kafkaTemplate.send(KafkaConfig.COMMANDS_TOPIC, String.valueOf(homeId), json);
            log.info("AutomationEngine sent SHUTDOWN to appliance {} ({}) in home {}. Reason: {}", 
                     applianceId, applianceName, homeId, reason);
        } catch (Exception e) {
            log.error("AutomationEngine failed to send command: {}", e.getMessage());
        }
    }
}
