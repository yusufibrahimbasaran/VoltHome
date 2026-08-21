package com.volthome.core.repository;

import com.volthome.core.model.jpa.ConsumptionHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ConsumptionHistoryRepository extends JpaRepository<ConsumptionHistory, Long> {
    List<ConsumptionHistory> findByHomeIdOrderByRecordedAtAsc(Long homeId);
}
