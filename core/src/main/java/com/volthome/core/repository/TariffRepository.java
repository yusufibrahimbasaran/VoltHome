package com.volthome.core.repository;

import com.volthome.core.model.jpa.TariffSchedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TariffRepository extends JpaRepository<TariffSchedule, Long> {

    /**
     * Find the tariff slot that covers a given hour of day.
     */
    @Query("SELECT t FROM TariffSchedule t WHERE t.hourStart <= :hour AND t.hourEnd > :hour")
    Optional<TariffSchedule> findByHour(@Param("hour") int hour);

    List<TariffSchedule> findAllByOrderByHourStartAsc();
}
