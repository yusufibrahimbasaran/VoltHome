package com.volthome.core.config;

import org.apache.ignite.Ignition;
import org.apache.ignite.client.IgniteClient;
import org.apache.ignite.configuration.ClientConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class IgniteConfig {
    private static final Logger log = LoggerFactory.getLogger(IgniteConfig.class);

    @Value("${ignite.addresses:localhost:10800}")
    private String igniteAddresses;

    @Bean
    public IgniteClient igniteClient() {
        ClientConfiguration cfg = new ClientConfiguration().setAddresses(igniteAddresses);
        
        int maxRetries = 10;
        int retryDelayMs = 3000;
        
        for (int i = 1; i <= maxRetries; i++) {
            try {
                log.info("Connecting to Apache Ignite at {} (Attempt {}/{})", igniteAddresses, i, maxRetries);
                IgniteClient client = Ignition.startClient(cfg);
                
                // Initialize/Pre-create caches
                client.getOrCreateCache("homeLiveStateCache");
                client.getOrCreateCache("applianceBreachCache");
                
                log.info("Successfully connected to Apache Ignite and initialized caches.");
                return client;
            } catch (Exception e) {
                log.warn("Failed to connect to Apache Ignite: {}. Retrying in {}s...", e.getMessage(), retryDelayMs / 1000);
                try {
                    Thread.sleep(retryDelayMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Ignite client initialization interrupted", ie);
                }
            }
        }
        
        throw new RuntimeException("Could not connect to Apache Ignite after " + maxRetries + " attempts. Please make sure the service is running.");
    }
}
