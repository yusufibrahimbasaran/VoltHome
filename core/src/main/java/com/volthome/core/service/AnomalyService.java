package com.volthome.core.service;

import org.apache.ignite.client.ClientCache;
import org.apache.ignite.client.IgniteClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class AnomalyService {
    private static final Logger log = LoggerFactory.getLogger(AnomalyService.class);

    private final IgniteClient igniteClient;

    @Autowired
    public AnomalyService(IgniteClient igniteClient) {
        this.igniteClient = igniteClient;
    }

    private ClientCache<Long, Integer> getBreachCache() {
        return igniteClient.getOrCreateCache("applianceBreachCache");
    }

    /**
     * Evaluates consecutive limit breaches for a specific appliance.
     * If an appliance exceeds its safe limit for 3 consecutive cycles, it is marked anomalous.
     * Counter resets to 0 when wattage returns below the safe limit.
     *
     * @return true if the appliance is in an anomalous state, false otherwise.
     */
    public boolean checkAnomaly(Long applianceId, String name, Double currentWatt, Double safeLimitWatt) {
        ClientCache<Long, Integer> cache = getBreachCache();
        
        if (currentWatt > safeLimitWatt) {
            Integer currentCount = cache.get(applianceId);
            if (currentCount == null) {
                currentCount = 0;
            }
            int newCount = currentCount + 1;
            cache.put(applianceId, newCount);
            
            log.info("Appliance {} ({}) breached limit! Current: {}W, Limit: {}W. Consecutive count: {}/3",
                    applianceId, name, currentWatt, safeLimitWatt, newCount);
            
            return newCount >= 3;
        } else {
            Integer currentCount = cache.get(applianceId);
            if (currentCount != null && currentCount > 0) {
                cache.put(applianceId, 0);
                log.info("Appliance {} ({}) returned to normal. Consecutive breach counter reset.", applianceId, name);
            }
            return false;
        }
    }
}
