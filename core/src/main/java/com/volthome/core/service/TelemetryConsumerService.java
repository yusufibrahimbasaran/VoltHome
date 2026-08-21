package com.volthome.core.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.volthome.core.config.KafkaConfig;
import com.volthome.core.model.ignite.ApplianceLiveState;
import com.volthome.core.model.ignite.HomeLiveState;
import com.volthome.core.model.jpa.ConsumptionHistory;
import com.volthome.core.model.jpa.EventLog;
import com.volthome.core.model.jpa.Home;
import com.volthome.core.repository.ConsumptionHistoryRepository;
import com.volthome.core.repository.EventLogRepository;
import com.volthome.core.repository.HomeRepository;
import org.apache.ignite.client.ClientCache;
import org.apache.ignite.client.IgniteClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.kafka.core.KafkaTemplate;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.HashMap;
import javax.cache.Cache;
import org.apache.ignite.cache.query.QueryCursor;
import org.apache.ignite.cache.query.ScanQuery;

@Service
public class TelemetryConsumerService {
    private static final Logger log = LoggerFactory.getLogger(TelemetryConsumerService.class);

    private final HomeService homeService;
    private final AnomalyService anomalyService;
    private final BillingRuleService billingRuleService;
    private final TariffService tariffService;
    private final AutomationEngine automationEngine;
    private final IgniteClient igniteClient;
    private final HomeRepository homeRepository;
    private final ConsumptionHistoryRepository consumptionHistoryRepository;
    private final EventLogRepository eventLogRepository;
    private final AIService aiService;
    private final ObjectMapper objectMapper;
    private final TelemetryWebSocketHandler webSocketHandler;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Autowired
    public TelemetryConsumerService(HomeService homeService,
                                    AnomalyService anomalyService,
                                    BillingRuleService billingRuleService,
                                    TariffService tariffService,
                                    AutomationEngine automationEngine,
                                    IgniteClient igniteClient,
                                    HomeRepository homeRepository,
                                    ConsumptionHistoryRepository consumptionHistoryRepository,
                                    EventLogRepository eventLogRepository,
                                    AIService aiService,
                                    ObjectMapper objectMapper,
                                    TelemetryWebSocketHandler webSocketHandler,
                                    KafkaTemplate<String, String> kafkaTemplate) {
        this.homeService = homeService;
        this.anomalyService = anomalyService;
        this.billingRuleService = billingRuleService;
        this.tariffService = tariffService;
        this.automationEngine = automationEngine;
        this.igniteClient = igniteClient;
        this.homeRepository = homeRepository;
        this.consumptionHistoryRepository = consumptionHistoryRepository;
        this.eventLogRepository = eventLogRepository;
        this.aiService = aiService;
        this.objectMapper = objectMapper;
        this.webSocketHandler = webSocketHandler;
        this.kafkaTemplate = kafkaTemplate;
    }

    private ClientCache<Long, HomeLiveState> getHomeCache() {
        return igniteClient.getOrCreateCache("homeLiveStateCache");
    }

    @KafkaListener(topics = KafkaConfig.TELEMETRY_TOPIC, groupId = "volthome-core-group")
    public void consumeTelemetry(String message) {
        try {
            Map<String, Object> payload = objectMapper.readValue(message, new TypeReference<Map<String, Object>>() {});
            
            Long homeId = ((Number) payload.get("homeId")).longValue();
            Long applianceId = ((Number) payload.get("applianceId")).longValue();
            Double wattage = ((Number) payload.get("wattage")).doubleValue();

            // Load live state from Ignite cache
            HomeLiveState liveState = homeService.getLiveStatus(homeId);
            
            if (liveState == null) {
                log.warn("Telemetry ignored: Could not find or initialize home status for ID {}", homeId);
                return;
            }

            ApplianceLiveState appState = liveState.getAppliances().get(applianceId);
            if (appState != null) {
                boolean was100Breached = liveState.getWarning100Triggered();

                // 1. Update appliance wattage
                appState.setCurrentWatt(wattage);

                // 2. Evaluate consecutive limit breaches (3 cycles)
                boolean isAnomalousNow = anomalyService.checkAnomaly(
                        applianceId, 
                        appState.getName(), 
                        wattage, 
                        appState.getSafeLimitWatt()
                );
                
                boolean wasAnomalous = appState.getIsAnomalous();
                appState.setIsAnomalous(isAnomalousNow);

                if (isAnomalousNow && !wasAnomalous) {
                    // State transitioned to anomalous
                    log.error("Anomaly detected for Appliance {} ({}) in home {}!", applianceId, appState.getName(), homeId);
                    logEvent(homeId, "APPLIANCE_ANOMALY", 
                            "Cihaz limit aşımı anomalisi tespit edildi: " + appState.getName() + 
                            " (" + String.format("%.2f", wattage) + "W / limit " + appState.getSafeLimitWatt() + "W).");
                    
                    // Trigger AI alert immediately
                    triggerAIAnomalyNotification(homeId, liveState, appState.getName(), wattage);

                    // Send auto shutdown command
                    sendShutdownCommand(homeId, applianceId, appState.getName(), "Cihaz tüketim limiti aşım anomalisi.");
                } else if (!isAnomalousNow && wasAnomalous) {
                    // State returned to normal
                    log.info("Anomaly cleared for Appliance {} ({}) in home {}.", applianceId, appState.getName(), homeId);
                    logEvent(homeId, "APPLIANCE_ANOMALY_CLEARED", 
                            "Cihaz limit aşımı anomalisi düzeldi: " + appState.getName() + 
                            " normal çalışma moduna döndü (" + String.format("%.2f", wattage) + "W).");
                }

                // 3. Accumulate energy and cost using Dynamic Tariff Engine
                // Assuming telemetry message interval is exactly 2 seconds.
                // energy_kwh = (watts * seconds) / (3600 * 1000)
                double deltaKwh  = (wattage * 2.0) / (3_600_000.0);
                double deltaCost = tariffService.computeIntervalCost(wattage); // dynamic TL cost

                liveState.setCumulativeEnergyKwh(liveState.getCumulativeEnergyKwh() + deltaKwh);
                liveState.setCumulativeCost(liveState.getCumulativeCost() + deltaCost);

                // Keep tariffRate in liveState in sync with dynamic engine
                liveState.setTariffRate(tariffService.getCurrentRate());

                // 4. Run billing evaluations (checks thresholds, enforces penalty tariffs)
                billingRuleService.evaluateBillingRules(liveState);

                // Check for budget breach transitions to trigger automated shutdowns
                boolean is100Breached = liveState.getWarning100Triggered();
                if (is100Breached && !was100Breached) {
                    log.warn("Budget 100% breach detected for home {}. Initiating emergency shutdown for all active appliances.", homeId);
                    for (ApplianceLiveState app : liveState.getAppliances().values()) {
                        if (app.getCurrentWatt() > 0) {
                            sendShutdownCommand(homeId, app.getId(), app.getName(), "Ev bütçe limitinin %100'ü aşıldı.");
                        }
                    }
                }

                // 5. Evaluate user-defined automation rules
                automationEngine.evaluate(homeId, liveState);

                // 6. Update Ignite cache state
                getHomeCache().put(homeId, liveState);

                // 7. Broadcast updated state via WebSocket
                try {
                    String liveStateJson = objectMapper.writeValueAsString(liveState);
                    webSocketHandler.broadcast(liveStateJson);
                } catch (Exception e) {
                    log.error("Failed to broadcast live status update via WebSockets: {}", e.getMessage());
                }
            }
            
        } catch (IOException e) {
            log.error("Failed to parse telemetry message JSON: {}. Message: {}", e.getMessage(), message);
        } catch (Exception e) {
            log.error("Error processing telemetry: {}", e.getMessage(), e);
        }
    }

    @Scheduled(fixedRate = 30000)
    public void recordConsumptionHistorySnapshots() {
        try {
            ClientCache<Long, HomeLiveState> cache = getHomeCache();
            try (QueryCursor<Cache.Entry<Long, HomeLiveState>> cursor = cache.query(new ScanQuery<>())) {
                int count = 0;
                for (Cache.Entry<Long, HomeLiveState> entry : cursor) {
                    HomeLiveState liveState = entry.getValue();
                    
                    Home home = homeRepository.findById(liveState.getHomeId()).orElse(null);
                    if (home != null) {
                        // Record history log
                        ConsumptionHistory history = ConsumptionHistory.builder()
                                .home(home)
                                .totalKwh(liveState.getCumulativeEnergyKwh())
                                .totalCost(liveState.getCumulativeCost())
                                .recordedAt(LocalDateTime.now())
                                .build();
                        consumptionHistoryRepository.save(history);
                        
                        // Sync current balance in database
                        home.setCurrentBalance(liveState.getCumulativeCost());
                        home.setCumulativeEnergyKwh(liveState.getCumulativeEnergyKwh());
                        homeRepository.save(home);
                        
                        count++;
                    }
                }
                if (count > 0) {
                    log.info("Recorded consumption snapshots to PostgreSQL for {} homes.", count);
                }
            }
        } catch (Exception e) {
            log.error("Error running periodic consumption trend snapshot logging: {}", e.getMessage());
        }
    }

    private void logEvent(Long homeId, String eventType, String description) {
        try {
            homeRepository.findById(homeId).ifPresent(home -> {
                EventLog eventLog = EventLog.builder()
                        .home(home)
                        .eventType(eventType)
                        .description(description)
                        .createdAt(LocalDateTime.now())
                        .build();
                eventLogRepository.save(eventLog);
            });
        } catch (Exception e) {
            log.error("Failed to log event [{}] in PostgreSQL: {}", eventType, e.getMessage());
        }
    }

    private void triggerAIAnomalyNotification(Long homeId, HomeLiveState liveState, String applianceName, Double wattage) {
        new Thread(() -> {
            try {
                aiService.generateAndSendRecommendation(homeId, liveState, "Cihaz Anomalisi: " + applianceName);
            } catch (Exception e) {
                log.error("Error sending AI anomaly alert: {}", e.getMessage());
            }
        }).start();
    }

    private void sendShutdownCommand(Long homeId, Long applianceId, String applianceName, String reason) {
        try {
            Map<String, Object> commandPayload = new HashMap<>();
            commandPayload.put("homeId", homeId);
            commandPayload.put("applianceId", applianceId);
            commandPayload.put("command", "SHUTDOWN");
            commandPayload.put("reason", reason);
            
            String messageJson = objectMapper.writeValueAsString(commandPayload);
            kafkaTemplate.send(KafkaConfig.COMMANDS_TOPIC, String.valueOf(homeId), messageJson);
            log.info("Sent SHUTDOWN command to Kafka topic {} for appliance {} in home {}. Reason: {}", 
                    KafkaConfig.COMMANDS_TOPIC, applianceId, homeId, reason);
            
            // Log event in PostgreSQL
            logEvent(homeId, "APPLIANCE_SHUTDOWN_COMMAND", 
                    "Cihaz otomatik kapatma emri gönderildi: " + applianceName + " (Neden: " + reason + ")");
        } catch (Exception e) {
            log.error("Failed to send shutdown command for appliance {}: {}", applianceId, e.getMessage());
        }
    }
}
