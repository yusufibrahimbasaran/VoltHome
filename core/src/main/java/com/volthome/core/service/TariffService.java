package com.volthome.core.service;

import com.volthome.core.model.jpa.TariffSchedule;
import com.volthome.core.repository.TariffRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Dynamic Tariff Engine — returns the current electricity price (TL/kWh)
 * based on the time-of-use schedule stored in the database.
 *
 * Turkey's EPDK time bands (as of 2024):
 *   Night  (00:00–06:00) → 2.10 TL/kWh
 *   Peak   (06:00–22:00) → 3.85 TL/kWh
 *   Night2 (22:00–24:00) → 2.10 TL/kWh
 */
@Service
public class TariffService {
    private static final Logger log = LoggerFactory.getLogger(TariffService.class);

    /**
     * Fallback rate used when no tariff schedule row covers the current hour.
     */
    private static final double DEFAULT_RATE = 2.50;

    private final TariffRepository tariffRepository;

    @Autowired
    public TariffService(TariffRepository tariffRepository) {
        this.tariffRepository = tariffRepository;
    }

    /**
     * Returns the active tariff rate for the current local hour.
     */
    public double getCurrentRate() {
        int hour = LocalDateTime.now().getHour();
        return tariffRepository.findByHour(hour)
                .map(TariffSchedule::getPricePerKwh)
                .orElse(DEFAULT_RATE);
    }

    /**
     * Returns the active tariff schedule slot for the current hour.
     */
    public TariffSchedule getCurrentTariff() {
        int hour = LocalDateTime.now().getHour();
        return tariffRepository.findByHour(hour).orElse(null);
    }

    /**
     * Returns all tariff schedule slots ordered by start hour.
     */
    public List<TariffSchedule> getAllTariffs() {
        return tariffRepository.findAllByOrderByHourStartAsc();
    }

    /**
     * Computes the incremental TL cost for a given wattage measured over a 2-second
     * telemetry interval at the current dynamic tariff rate.
     *
     * @param wattage  Device power in watts
     * @return         Cost in TL
     */
    public double computeIntervalCost(double wattage) {
        double kwh = (wattage * 2.0) / (3_600_000.0); // 2-second interval → kWh
        double rate = getCurrentRate();
        return kwh * rate;
    }
}
