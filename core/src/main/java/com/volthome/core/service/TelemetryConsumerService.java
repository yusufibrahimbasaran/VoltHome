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

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Map;
import javax.cache.Cache;
import org.apache.ignite.cache.query.QueryCursor;
import org.apache.ignite.cache.query.ScanQuery;

@Service
public class TelemetryConsumerService {
    private static final Logger log = LoggerFactory.getLogger(TelemetryConsumerService.class);

    private final HomeService homeService;
    private final AnomalyService anomalyService;
    private final BillingRuleService billingRuleService;
    private final IgniteClient igniteClient;
    private final HomeRepository homeRepository;
    private final ConsumptionHistoryRepository consumptionHistoryRepository;
    private final EventLogRepository eventLogRepository;
    private final AIService aiService;
    private final ObjectMapper objectMapper;

    @Autowired
    public TelemetryConsumerService(HomeService homeService,
                                    AnomalyService anomalyService,
                                    BillingRuleService billingRuleService,
                                    IgniteClient igniteClient,
                                    HomeRepository homeRepository,
                                    ConsumptionHistoryRepository consumptionHistoryRepository,
                                    EventLogRepository eventLogRepository,
                                    AIService aiService,
                                    ObjectMapper objectMapper) {
        this.homeService = homeService;
        this.anomalyService = anomalyService;
        this.billingRuleService = billingRuleService;
        this.igniteClient = igniteClient;
        this.homeRepository = homeRepository;
        this.consumptionHistoryRepository = consumptionHistoryRepository;
        this.eventLogRepository = eventLogRepository;
        this.aiService = aiService;
        this.objectMapper = objectMapper;
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
                } else if (!isAnomalousNow && wasAnomalous) {
                    // State returned to normal
                    log.info("Anomaly cleared for Appliance {} ({}) in home {}.", applianceId, appState.getName(), homeId);
                    logEvent(homeId, "APPLIANCE_ANOMALY_CLEARED", 
                            "Cihaz limit aşımı anomalisi düzeldi: " + appState.getName() + 
                            " normal çalışma moduna döndü (" + String.format("%.2f", wattage) + "W).");
                }

                // 3. Accumulate energy and cost
                // Assuming telemetry message interval is exactly 2 seconds.
                // energy_kwh = (watts * seconds) / (3600 * 1000)
                double deltaKwh = (wattage * 2.0) / (3600.0 * 1000.0);
                double deltaCost = deltaKwh * liveState.getTariffRate();

                liveState.setCumulativeEnergyKwh(liveState.getCumulativeEnergyKwh() + deltaKwh);
                liveState.setCumulativeCost(liveState.getCumulativeCost() + deltaCost);

                // 4. Run billing evaluations (checks thresholds, enforces penalty tariffs)
                billingRuleService.evaluateBillingRules(liveState);

                // 5. Update Ignite cache state
                getHomeCache().put(homeId, liveState);
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
}
