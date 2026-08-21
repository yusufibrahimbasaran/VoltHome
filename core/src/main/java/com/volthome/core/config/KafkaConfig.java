package com.volthome.core.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaConfig {

    public static final String REGISTRATION_TOPIC = "volthome-registration";
    public static final String TELEMETRY_TOPIC = "volthome-telemetry";
    public static final String COMMANDS_TOPIC = "volthome-commands";

    @Bean
    public NewTopic registrationTopic() {
        return TopicBuilder.name(REGISTRATION_TOPIC)
                .partitions(1)
                .replicas(1)
                .build();
    }

    @Bean
    public NewTopic telemetryTopic() {
        return TopicBuilder.name(TELEMETRY_TOPIC)
                .partitions(1)
                .replicas(1)
                .build();
    }

    @Bean
    public NewTopic commandsTopic() {
        return TopicBuilder.name(COMMANDS_TOPIC)
                .partitions(1)
                .replicas(1)
                .build();
    }
}
