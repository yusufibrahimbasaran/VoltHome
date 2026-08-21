package com.volthome.core.model.ignite;

import lombok.*;
import java.io.Serializable;
import java.util.HashMap;
import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@ToString
public class HomeLiveState implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long homeId;
    private String name;
    private String contactEmail;
    private Double budgetQuota;
    private Double cumulativeEnergyKwh;
    private Double cumulativeCost;
    private Boolean isPenaltyTariff;
    private Double tariffRate;

    @Builder.Default
    private Boolean warning80Triggered = false;

    @Builder.Default
    private Boolean warning100Triggered = false;

    @Builder.Default
    private Map<Long, ApplianceLiveState> appliances = new HashMap<>();
}
