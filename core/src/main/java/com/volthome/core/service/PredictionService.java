package com.volthome.core.service;

import com.volthome.core.model.ignite.HomeLiveState;
import com.volthome.core.model.jpa.ConsumptionHistory;
import com.volthome.core.repository.ConsumptionHistoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Month-End Consumption & Cost Prediction Service.
 *
 * Uses a simple linear projection:
 *   daily_average = total_so_far / days_elapsed
 *   predicted_total = daily_average * total_days_in_month
 *
 * All cost predictions use the current live tariff rate.
 */
@Service
public class PredictionService {
    private static final Logger log = LoggerFactory.getLogger(PredictionService.class);

    private final ConsumptionHistoryRepository consumptionHistoryRepository;
    private final TariffService tariffService;

    @Autowired
    public PredictionService(ConsumptionHistoryRepository consumptionHistoryRepository,
                              TariffService tariffService) {
        this.consumptionHistoryRepository = consumptionHistoryRepository;
        this.tariffService = tariffService;
    }

    /**
     * Generates a month-end prediction map for a given home based on its live state
     * and historical consumption snapshots.
     *
     * Returns a map with keys:
     *  - daysElapsed          : int
     *  - daysRemaining        : int
     *  - totalDaysInMonth     : int
     *  - currentKwh           : double   (actual so far)
     *  - currentCost          : double   (actual so far)
     *  - predictedKwh         : double   (projected month total)
     *  - predictedCost        : double   (projected month total in TL)
     *  - budgetQuota          : double
     *  - budgetStatus         : String   ("OK", "WARNING", "EXCEEDED")
     *  - overshootPercent     : double   (how much % over/under budget)
     *  - currentTariffRate    : double   (TL/kWh right now)
     *  - currentTariffLabel   : String
     */
    public Map<String, Object> predictMonthEnd(Long homeId, HomeLiveState liveState) {
        Map<String, Object> result = new HashMap<>();

        LocalDate today = LocalDate.now();
        int dayOfMonth = today.getDayOfMonth();
        int totalDays = YearMonth.from(today).lengthOfMonth();
        int daysRemaining = totalDays - dayOfMonth;

        // Start of this month
        LocalDateTime monthStart = today.withDayOfMonth(1).atStartOfDay();

        // Fetch history snapshots for this month to derive daily average
        List<ConsumptionHistory> history = consumptionHistoryRepository
                .findByHomeIdAndRecordedAtAfterOrderByRecordedAtAsc(homeId, monthStart);

        double currentKwh  = liveState.getCumulativeEnergyKwh();
        double currentCost = liveState.getCumulativeCost();

        // Safe division: if day 1 has no history, use live state directly
        double daysElapsed = Math.max(dayOfMonth - 1, 1);
        double dailyAvgKwh  = currentKwh  / daysElapsed;
        double dailyAvgCost = currentCost / daysElapsed;

        double predictedKwh  = currentKwh  + (dailyAvgKwh  * daysRemaining);
        double predictedCost = currentCost + (dailyAvgCost * daysRemaining);

        double quota = liveState.getBudgetQuota();
        String budgetStatus;
        double overshootPercent = ((predictedCost - quota) / quota) * 100.0;

        if (predictedCost < quota * 0.8) {
            budgetStatus = "OK";
        } else if (predictedCost < quota) {
            budgetStatus = "WARNING";
        } else {
            budgetStatus = "EXCEEDED";
        }

        // Tariff info
        double currentRate = tariffService.getCurrentRate();
        var currentTariff = tariffService.getCurrentTariff();
        String tariffLabel = currentTariff != null ? currentTariff.getLabel() : "Standart Tarife";

        result.put("daysElapsed",       (int) daysElapsed);
        result.put("daysRemaining",     daysRemaining);
        result.put("totalDaysInMonth",  totalDays);
        result.put("currentKwh",        round(currentKwh, 3));
        result.put("currentCost",       round(currentCost, 2));
        result.put("predictedKwh",      round(predictedKwh, 3));
        result.put("predictedCost",     round(predictedCost, 2));
        result.put("budgetQuota",       quota);
        result.put("budgetStatus",      budgetStatus);
        result.put("overshootPercent",  round(overshootPercent, 1));
        result.put("currentTariffRate", currentRate);
        result.put("currentTariffLabel", tariffLabel);
        result.put("historyPoints",     history.size());

        log.info("Prediction for home {}: predicted {:.2f} TL vs quota {} TL → {}", 
                 homeId, predictedCost, quota, budgetStatus);
        return result;
    }

    private double round(double value, int decimals) {
        double factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }
}
