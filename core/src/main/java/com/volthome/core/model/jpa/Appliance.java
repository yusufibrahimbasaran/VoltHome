package com.volthome.core.model.jpa;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "appliances")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Appliance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "home_id", nullable = false)
    @JsonIgnore
    private Home home;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String type; // REFRIGERATOR, AC, WASHING_MACHINE, etc.

    @Column(name = "safe_limit_watt", nullable = false)
    private Double safeLimitWatt;
}
