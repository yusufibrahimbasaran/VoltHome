package com.volthome.core.controller;

import com.volthome.core.model.ignite.HomeLiveState;
import com.volthome.core.model.jpa.AIRecommendation;
import com.volthome.core.model.jpa.ConsumptionHistory;
import com.volthome.core.model.jpa.Home;
import com.volthome.core.repository.AIRecommendationRepository;
import com.volthome.core.service.AIService;
import com.volthome.core.service.HomeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/homes")
@CrossOrigin(origins = "*") // Prevent CORS issues during local HTML frontend development
@Tag(name = "VoltHome Management", description = "Endpoints for registering homes, polling live sensor states, and loading history trends")
public class HomeController {

    private final HomeService homeService;
    private final AIService aiService;
    private final AIRecommendationRepository aiRecommendationRepository;

    @Autowired
    public HomeController(HomeService homeService,
                          AIService aiService,
                          AIRecommendationRepository aiRecommendationRepository) {
        this.homeService = homeService;
        this.aiService = aiService;
        this.aiRecommendationRepository = aiRecommendationRepository;
    }

    @PostMapping
    @Operation(summary = "Register a new home", description = "Saves residential structure and its appliance topologies to PostgreSQL, initializes Ignite, and publishes registration event to Kafka")
    public ResponseEntity<Home> registerHome(@RequestBody Home home) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String username = auth.getName();
            Home savedHome = homeService.registerHome(home, username);
            return ResponseEntity.ok(savedHome);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping
    @Operation(summary = "List all registered homes", description = "Returns persistent general details of all registered homes from PostgreSQL database")
    public ResponseEntity<List<Home>> getAllHomes() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String username = auth.getName();
        return ResponseEntity.ok(homeService.getAllHomes(username));
    }

    @GetMapping("/{id}/status")
    @Operation(summary = "Poll real-time home status", description = "Retrieves live accumulated metrics, active tariff rate, and appliance breach details from Apache Ignite, joined with the latest AI recommendation")
    public ResponseEntity<Map<String, Object>> getHomeLiveStatus(@PathVariable Long id) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String username = auth.getName();
            Home home = homeService.getHomeById(id);
            if (home == null || home.getUser() == null || !home.getUser().getUsername().equals(username)) {
                return ResponseEntity.status(403).build();
            }

            HomeLiveState liveState = homeService.getLiveStatus(id);
            
            // Fetch the latest AI recommendation from PostgreSQL
            String latestAI = aiRecommendationRepository.findFirstByHomeIdOrderByCreatedAtDesc(id)
                    .map(AIRecommendation::getRecommendationText)
                    .orElse("Eviniz için henüz bir tasarruf önerisi üretilmedi. Bütçenizin %80 veya %100 limitleri aşıldığında otomatik üretilecektir.");

            Map<String, Object> response = new HashMap<>();
            response.put("liveState", liveState);
            response.put("latestAIRecommendation", latestAI);
            
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/{id}/trends")
    @Operation(summary = "Get historical consumption trends", description = "Fetches periodic/daily cumulative energy and cost snapshots from PostgreSQL database to populate frontend historical charts")
    public ResponseEntity<List<ConsumptionHistory>> getHomeTrends(@PathVariable Long id) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String username = auth.getName();
        Home home = homeService.getHomeById(id);
        if (home == null || home.getUser() == null || !home.getUser().getUsername().equals(username)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(homeService.getHistoricalTrends(id));
    }

    @PostMapping("/{id}/trigger-ai")
    @Operation(summary = "Manually trigger AI advisory alert", description = "Asynchronously processes the current live status, sends prompt to Google Gemini, stores suggestion, and dispatches email notification")
    public ResponseEntity<Map<String, String>> triggerAIRecommendation(@PathVariable Long id) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String username = auth.getName();
            Home home = homeService.getHomeById(id);
            if (home == null || home.getUser() == null || !home.getUser().getUsername().equals(username)) {
                return ResponseEntity.status(403).build();
            }

            HomeLiveState liveState = homeService.getLiveStatus(id);
            new Thread(() -> {
                try {
                    aiService.generateAndSendRecommendation(id, liveState, "Manuel Talep");
                } catch (Exception e) {
                    // Logged in AIService
                  }
            }).start();
            
            Map<String, String> res = new HashMap<>();
            res.put("status", "Yapay zeka analiz süreci arka planda başlatıldı. Tamamlandığında kayıtlı e-posta adresine gönderilecektir.");
            return ResponseEntity.ok(res);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}
