package com.volthome.core.repository;

import com.volthome.core.model.jpa.AIRecommendation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface AIRecommendationRepository extends JpaRepository<AIRecommendation, Long> {
    Optional<AIRecommendation> findFirstByHomeIdOrderByCreatedAtDesc(Long homeId);
}
