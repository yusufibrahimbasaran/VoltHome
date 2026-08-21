package com.volthome.core.service;

import com.volthome.core.model.jpa.EventLog;
import com.volthome.core.model.jpa.Home;
import com.volthome.core.model.ignite.HomeLiveState;
import com.volthome.core.repository.EventLogRepository;
import com.volthome.core.repository.HomeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class BillingRuleService {
    private static final Logger log = LoggerFactory.getLogger(BillingRuleService.class);

    private final HomeRepository homeRepository;
    private final EventLogRepository eventLogRepository;
    private final AIService aiService;
    
    @Value("${volthome.tariff.penalty:5.0}")
    private Double penaltyTariffRate;

    @Autowired
    public BillingRuleService(HomeRepository homeRepository,
                              EventLogRepository eventLogRepository,
                              @Lazy AIService aiService) {
        this.homeRepository = homeRepository;
        this.eventLogRepository = eventLogRepository;
        this.aiService = aiService;
    }

    /**
     * Checks if the home cost has breached 80% or 100% of the budget quota.
     * Enforces penalty tariffs and triggers AI recommendations.
     * Modifies the HomeLiveState in-place if flags or rates change.
     *
     * @param liveState The current live state of the home from Ignite.
     * @return true if state was changed, false otherwise.
     */
    @Transactional
    public boolean evaluateBillingRules(HomeLiveState liveState) {
        double cost = liveState.getCumulativeCost();
        double quota = liveState.getBudgetQuota();
        Long homeId = liveState.getHomeId();
        
        boolean stateChanged = false;

        // Calculate thresholds
        double threshold80 = quota * 0.8;
        double threshold100 = quota;

        // Check 100% breach first (takes precedence)
        if (cost >= threshold100) {
            if (!liveState.getWarning100Triggered()) {
                liveState.setWarning100Triggered(true);
                liveState.setWarning80Triggered(true); // Mark 80% as warning triggered too
                liveState.setIsPenaltyTariff(true);
                liveState.setTariffRate(penaltyTariffRate);
                stateChanged = true;
                
                log.warn("Home {} breached 100% budget limit! Cost: {}, Quota: {}. Activating penalty tariff.", homeId, cost, quota);
                
                // Persist state in PostgreSQL database
                updateHomeDbState(homeId, cost, liveState.getCumulativeEnergyKwh(), true, penaltyTariffRate);
                
                // Log event
                logEvent(homeId, "QUOTA_BREACH_100", "Bütçe limitinin %100'ü aşıldı (" + String.format("%.2f", cost) + " TL / " + quota + " TL). Cezalı tarifeye geçildi.");
                
                // Trigger AI Notification Pipeline (runs in background or handles exceptions internally)
                triggerAINotification(homeId, liveState, "100% Limit Aşımı");
            }
        } 
        // Check 80% breach
        else if (cost >= threshold80) {
            if (!liveState.getWarning80Triggered()) {
                liveState.setWarning80Triggered(true);
                stateChanged = true;
                
                log.warn("Home {} breached 80% budget limit! Cost: {}, Quota: {}.", homeId, cost, quota);
                
                // Sync cost to db
                updateHomeDbState(homeId, cost, liveState.getCumulativeEnergyKwh(), false, liveState.getTariffRate());
                
                // Log event
                logEvent(homeId, "QUOTA_BREACH_80", "Bütçe limitinin %80'i aşıldı (" + String.format("%.2f", cost) + " TL / " + quota + " TL).");
                
                // Trigger AI Notification Pipeline
                triggerAINotification(homeId, liveState, "80% Limit Uyarısı");
            }
        }
        
        return stateChanged;
    }

    private void updateHomeDbState(Long homeId, Double cost, Double kwh, Boolean isPenalty, Double rate) {
        try {
            homeRepository.findById(homeId).ifPresent(home -> {
                home.setCurrentBalance(cost);
                home.setCumulativeEnergyKwh(kwh);
                home.setIsPenaltyTariff(isPenalty);
                home.setTariffRate(rate);
                homeRepository.save(home);
                log.info("Synced home {} state to PostgreSQL: Balance={}, Penalty={}", homeId, cost, isPenalty);
            });
        } catch (Exception e) {
            log.error("Failed to sync home state to PostgreSQL for homeId {}: {}", homeId, e.getMessage());
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
                log.info("Created event log [{}] for home {}", eventType, homeId);
            });
        } catch (Exception e) {
            log.error("Failed to log event [{}] in PostgreSQL: {}", eventType, e.getMessage());
        }
    }

    private void triggerAINotification(Long homeId, HomeLiveState liveState, String triggerReason) {
        // Trigger AIService in a separate thread to prevent blocking Kafka consumer threads
        new Thread(() -> {
            try {
                aiService.generateAndSendRecommendation(homeId, liveState, triggerReason);
            } catch (Exception e) {
                log.error("Error in async AI notification thread for home {}: {}", homeId, e.getMessage());
            }
        }).start();
    }
}
