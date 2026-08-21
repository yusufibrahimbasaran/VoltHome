package com.volthome.core.model.jpa;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "automation_rules")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AutomationRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "home_id", nullable = false)
    private Home home;

    /**
     * Type of device this rule targets, e.g. "AC", "FRIDGE", "HEATER", or "*" for all.
     */
    @Column(name = "device_type", nullable = false)
    private String deviceType;

    /**
     * Trigger condition: "WATTAGE_EXCEED", "ANOMALY", "BUDGET_80", "BUDGET_100"
     */
    @Column(name = "trigger_type", nullable = false)
    private String triggerType;

    /**
     * Threshold value for WATTAGE_EXCEED trigger (in watts).
     */
    @Column(name = "trigger_value")
    private Double triggerValue;

    /**
     * Action to take: "SHUTDOWN", "LOG_ONLY"
     */
    @Column(name = "action", nullable = false)
    private String action;

    @Column(name = "enabled", nullable = false)
    @Builder.Default
    private Boolean enabled = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
