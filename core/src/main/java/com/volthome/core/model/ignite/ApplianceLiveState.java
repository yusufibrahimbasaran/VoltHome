package com.volthome.core.model.ignite;

import lombok.*;
import java.io.Serializable;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@ToString
public class ApplianceLiveState implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long id;
    private String name;
    private String type;
    private Double safeLimitWatt;
    private Double currentWatt;
    private Integer consecutiveBreaches;
    private Boolean isAnomalous;
}
