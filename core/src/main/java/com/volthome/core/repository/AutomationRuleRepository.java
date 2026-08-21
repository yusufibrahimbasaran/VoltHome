package com.volthome.core.repository;

import com.volthome.core.model.jpa.AutomationRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AutomationRuleRepository extends JpaRepository<AutomationRule, Long> {

    List<AutomationRule> findByHomeIdAndEnabledTrue(Long homeId);

    List<AutomationRule> findByHomeId(Long homeId);
}
