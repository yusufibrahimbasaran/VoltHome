package com.volthome.core.repository;

import com.volthome.core.model.jpa.EventLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EventLogRepository extends JpaRepository<EventLog, Long> {
    List<EventLog> findByHomeIdOrderByCreatedAtDesc(Long homeId);
}
