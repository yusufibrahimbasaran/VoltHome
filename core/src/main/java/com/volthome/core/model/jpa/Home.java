package com.volthome.core.model.jpa;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "homes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Home {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(name = "contact_email", nullable = false)
    private String contactEmail;

    @Column(name = "budget_quota", nullable = false)
    private Double budgetQuota;

    @Column(name = "current_balance", nullable = false)
    @Builder.Default
    private Double currentBalance = 0.0;

    @Column(name = "cumulative_energy_kwh", nullable = false)
    @Builder.Default
    private Double cumulativeEnergyKwh = 0.0;

    @Column(name = "is_penalty_tariff", nullable = false)
    @Builder.Default
    private Boolean isPenaltyTariff = false;

    @Column(name = "tariff_rate", nullable = false)
    @Builder.Default
    private Double tariffRate = 2.5;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @OneToMany(mappedBy = "home", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @Builder.Default
    private List<Appliance> appliances = new ArrayList<>();
}
