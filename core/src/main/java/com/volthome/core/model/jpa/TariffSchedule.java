package com.volthome.core.model.jpa;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "tariff_schedule")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TariffSchedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Hour of day this tariff slot starts (0-23, inclusive).
     */
    @Column(name = "hour_start", nullable = false)
    private Integer hourStart;

    /**
     * Hour of day this tariff slot ends (0-23, exclusive).
     */
    @Column(name = "hour_end", nullable = false)
    private Integer hourEnd;

    /**
     * Price in TL per kWh during this slot.
     */
    @Column(name = "price_per_kwh", nullable = false)
    private Double pricePerKwh;

    /**
     * Human-readable label, e.g. "Gece Tarifesi", "Gündüz Tarifesi".
     */
    @Column(name = "label", nullable = false)
    private String label;
}
