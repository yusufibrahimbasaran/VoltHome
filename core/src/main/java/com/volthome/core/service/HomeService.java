package com.volthome.core.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.volthome.core.config.KafkaConfig;
import com.volthome.core.model.ignite.ApplianceLiveState;
import com.volthome.core.model.ignite.HomeLiveState;
import com.volthome.core.model.jpa.Appliance;
import com.volthome.core.model.jpa.ConsumptionHistory;
import com.volthome.core.model.jpa.Home;
import com.volthome.core.repository.ConsumptionHistoryRepository;
import com.volthome.core.repository.HomeRepository;
import org.apache.ignite.client.ClientCache;
import org.apache.ignite.client.IgniteClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class HomeService {
    private static final Logger log = LoggerFactory.getLogger(HomeService.class);

    private final HomeRepository homeRepository;
    private final ConsumptionHistoryRepository consumptionHistoryRepository;
    private final IgniteClient igniteClient;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Autowired
    public HomeService(HomeRepository homeRepository,
                       ConsumptionHistoryRepository consumptionHistoryRepository,
                       IgniteClient igniteClient,
                       KafkaTemplate<String, String> kafkaTemplate,
                       ObjectMapper objectMapper) {
        this.homeRepository = homeRepository;
        this.consumptionHistoryRepository = consumptionHistoryRepository;
        this.igniteClient = igniteClient;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
    }

    private ClientCache<Long, HomeLiveState> getHomeCache() {
        return igniteClient.getOrCreateCache("homeLiveStateCache");
    }

    /**
     * Registers a new residential structure, persists it to PostgreSQL,
     * initializes Apache Ignite cache, and publishes registration event to Kafka.
     */
    @Transactional
    public Home registerHome(Home home) {
        // Link appliances to home for JPA cascade persist
        if (home.getAppliances() != null) {
            for (Appliance app : home.getAppliances()) {
                app.setHome(home);
            }
        }
        
        home.setCreatedAt(LocalDateTime.now());
        home.setCurrentBalance(0.0);
        home.setCumulativeEnergyKwh(0.0);
        home.setIsPenaltyTariff(false);
        home.setTariffRate(2.5);

        Home savedHome = homeRepository.save(home);
        log.info("Registered and saved home {} in PostgreSQL", savedHome.getId());

        // Initialize state in Ignite cache
        HomeLiveState liveState = initializeLiveState(savedHome);
        getHomeCache().put(savedHome.getId(), liveState);
        log.info("Initialized Ignite cache for home {}", savedHome.getId());

        // Publish registration event to Kafka registration topic
        publishRegistrationEvent(savedHome);

        return savedHome;
    }

    /**
     * Fetches the live status of the home from Apache Ignite.
     * If not present, reloads it from PostgreSQL and populates the cache.
     */
    public HomeLiveState getLiveStatus(Long homeId) {
        ClientCache<Long, HomeLiveState> cache = getHomeCache();
        HomeLiveState liveState = cache.get(homeId);
        
        if (liveState == null) {
            log.warn("HomeLiveState not found in Ignite for homeId {}. Reloading from PostgreSQL.", homeId);
            Optional<Home> homeOpt = homeRepository.findById(homeId);
            if (homeOpt.isPresent()) {
                liveState = initializeLiveState(homeOpt.get());
                cache.put(homeId, liveState);
            } else {
                throw new IllegalArgumentException("Home not found with id: " + homeId);
            }
        }
        return liveState;
    }

    /**
     * Fetches daily historical energy trends from PostgreSQL.
     */
    public List<ConsumptionHistory> getHistoricalTrends(Long homeId) {
        return consumptionHistoryRepository.findByHomeIdOrderByRecordedAtAsc(homeId);
    }

    /**
     * Retrieves all homes from the persistent database.
     */
    public List<Home> getAllHomes() {
        return homeRepository.findAll();
    }

    /**
     * Converts a DB Home entity to an Ignite HomeLiveState object.
     */
    public HomeLiveState initializeLiveState(Home home) {
        Map<Long, ApplianceLiveState> applianceMap = new HashMap<>();
        if (home.getAppliances() != null) {
            for (Appliance app : home.getAppliances()) {
                applianceMap.put(app.getId(), ApplianceLiveState.builder()
                        .id(app.getId())
                        .name(app.getName())
                        .type(app.getType())
                        .safeLimitWatt(app.getSafeLimitWatt())
                        .currentWatt(0.0)
                        .consecutiveBreaches(0)
                        .isAnomalous(false)
                        .build());
            }
        }

        return HomeLiveState.builder()
                .homeId(home.getId())
                .name(home.getName())
                .contactEmail(home.getContactEmail())
                .budgetQuota(home.getBudgetQuota())
                .cumulativeEnergyKwh(home.getCumulativeEnergyKwh())
                .cumulativeCost(home.getCurrentBalance())
                .isPenaltyTariff(home.getIsPenaltyTariff())
                .tariffRate(home.getTariffRate())
                .warning80Triggered(home.getCurrentBalance() >= home.getBudgetQuota() * 0.8)
                .warning100Triggered(home.getCurrentBalance() >= home.getBudgetQuota())
                .appliances(applianceMap)
                .build();
    }

    private void publishRegistrationEvent(Home home) {
        try {
            // Map to a simplified JSON object for simulator consumption
            Map<String, Object> event = new HashMap<>();
            event.put("homeId", home.getId());
            event.put("name", home.getName());
            
            Map<String, Object>[] apps = home.getAppliances().stream().map(app -> {
                Map<String, Object> m = new HashMap<>();
                m.put("id", app.getId());
                m.put("name", app.getName());
                m.put("type", app.getType());
                m.put("safeLimitWatt", app.getSafeLimitWatt());
                return m;
            }).toArray(Map[]::new);
            
            event.put("appliances", apps);
            
            String jsonPayload = objectMapper.writeValueAsString(event);
            kafkaTemplate.send(KafkaConfig.REGISTRATION_TOPIC, home.getId().toString(), jsonPayload);
            log.info("Published asset registration event to Kafka topic {}: {}", KafkaConfig.REGISTRATION_TOPIC, jsonPayload);
        } catch (Exception e) {
            log.error("Failed to publish registration event to Kafka: {}", e.getMessage(), e);
        }
    }
}
