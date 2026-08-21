package com.volthome.core.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.volthome.core.model.ignite.ApplianceLiveState;
import com.volthome.core.model.ignite.HomeLiveState;
import com.volthome.core.model.jpa.AIRecommendation;
import com.volthome.core.model.jpa.Home;
import com.volthome.core.repository.AIRecommendationRepository;
import com.volthome.core.repository.HomeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AIService {
    private static final Logger log = LoggerFactory.getLogger(AIService.class);

    private final HomeRepository homeRepository;
    private final AIRecommendationRepository aiRecommendationRepository;
    private final NotificationService notificationService;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    @Value("${gemini.api.key:}")
    private String geminiApiKey;

    @Value("${gemini.api.url}")
    private String geminiApiUrl;

    @Autowired
    public AIService(HomeRepository homeRepository,
                     AIRecommendationRepository aiRecommendationRepository,
                     NotificationService notificationService,
                     ObjectMapper objectMapper) {
        this.homeRepository = homeRepository;
        this.aiRecommendationRepository = aiRecommendationRepository;
        this.notificationService = notificationService;
        this.objectMapper = objectMapper;
        this.restTemplate = new RestTemplate();
    }

    /**
     * Composes a prompt using home metrics, invokes Google Gemini API,
     * persists the recommendation, and dispatches the email.
     */
    public void generateAndSendRecommendation(Long homeId, HomeLiveState liveState, String triggerReason) {
        log.info("Starting AI Recommendation generation for Home: {} (Reason: {})", liveState.getName(), triggerReason);
        
        // 1. Compose the context-rich Turkish prompt
        String prompt = composePrompt(liveState, triggerReason);
        
        // 2. Fetch the recommendation from Gemini (or fallback)
        String recommendationText = callGeminiAPI(prompt);

        // 3. Save recommendation to PostgreSQL database
        Home home = homeRepository.findById(homeId).orElse(null);
        if (home != null) {
            try {
                AIRecommendation rec = AIRecommendation.builder()
                        .home(home)
                        .recommendationText(recommendationText)
                        .sentToEmail(liveState.getContactEmail())
                        .createdAt(LocalDateTime.now())
                        .build();
                aiRecommendationRepository.save(rec);
                log.info("Saved AI Recommendation log in PostgreSQL database for home {}", homeId);
            } catch (Exception e) {
                log.error("Failed to save AI Recommendation to DB: {}", e.getMessage());
            }

            // 4. Send email via NotificationService
            String subject = "VoltHome Enerji Raporu ve Tasarruf Tavsiyeleri (" + triggerReason + ")";
            String emailBody = String.format(
                    "Merhaba %s,\n\n" +
                    "Eviniz için tetiklenen yeni durum: %s\n\n" +
                    "Yapay Zeka Tasarruf Tavsiyeleriniz:\n" +
                    "======================================================================\n" +
                    "%s\n" +
                    "======================================================================\n\n" +
                    "Enerjinizi kontrol etmek ve faturanızı optimize etmek için VoltHome izleme panelinizi ziyaret edin.\n\n" +
                    "Saygılarımızla,\n" +
                    "VoltHome Akıllı Enerji Sistemi", 
                    liveState.getName(), triggerReason, recommendationText);
            
            notificationService.sendEmail(liveState.getContactEmail(), subject, emailBody);
        } else {
            log.error("Could not find Home entity with ID {} to link AI recommendation.", homeId);
        }
    }

    private String composePrompt(HomeLiveState liveState, String triggerReason) {
        List<String> anomalousAppList = new ArrayList<>();
        List<String> normalAppList = new ArrayList<>();

        for (ApplianceLiveState app : liveState.getAppliances().values()) {
            String appInfo = String.format("- %s (%s): Mevcut Güç: %.1fW, Limit: %.1fW",
                    app.getName(), app.getType(), app.getCurrentWatt(), app.getSafeLimitWatt());
            if (app.getIsAnomalous()) {
                anomalousAppList.add(appInfo + " [ANOMALİ - LİMİT AŞILDI]");
            } else {
                normalAppList.add(appInfo);
            }
        }

        return String.format(
                "VoltHome Akıllı Enerji Raporu Oluşturucu.\n" +
                "Evin Adı: %s\n" +
                "Bütçe Kotası: %.2f TL\n" +
                "Mevcut Birikmiş Fatura: %.2f TL\n" +
                "Cezalı Tarife Aktif mi?: %s\n" +
                "Aktif Tarife Ücreti: %.2f TL/kWh\n" +
                "Uyarı Sebebi: %s\n\n" +
                "Evin Cihaz Durumları:\n" +
                "**Limit Aşan/Anomalili Cihazlar**:\n%s\n\n" +
                "**Normal Çalışan Cihazlar**:\n%s\n\n" +
                "Görev: Bu verileri analiz et. Bu evin sahibine hitaben samimi, bilgilendirici ve aksiyon alınabilir Türkçe bir enerji tasarrufu e-posta içeriği yaz.\n" +
                "Format: Doğrudan tasarruf tavsiyelerini ve önerilen eylemleri sırala. Giriş ve sonuç kısımlarını kısa tut. Yazı dili tamamen Türkçe olmalıdır. HTML etiketi kullanma.",
                liveState.getName(),
                liveState.getBudgetQuota(),
                liveState.getCumulativeCost(),
                liveState.getIsPenaltyTariff() ? "EVET" : "HAYIR",
                liveState.getTariffRate(),
                triggerReason,
                anomalousAppList.isEmpty() ? "Yok" : String.join("\n", anomalousAppList),
                normalAppList.isEmpty() ? "Yok" : String.join("\n", normalAppList)
        );
    }

    private String callGeminiAPI(String prompt) {
        if (geminiApiKey == null || geminiApiKey.trim().isEmpty()) {
            log.warn("GEMINI_API_KEY environment variable is not configured. Returning local fallback advice.");
            return getFallbackAdvice();
        }

        try {
            String apiUrl = geminiApiUrl + "?key=" + geminiApiKey;

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            // Construct payload: {"contents": [{"parts": [{"text": prompt}]}]}
            Map<String, Object> partsMap = new HashMap<>();
            partsMap.put("text", prompt);
            
            List<Map<String, Object>> partsList = new ArrayList<>();
            partsList.add(partsMap);
            
            Map<String, Object> contentsMap = new HashMap<>();
            contentsMap.put("parts", partsList);
            
            List<Map<String, Object>> contentsList = new ArrayList<>();
            contentsList.add(contentsMap);
            
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("contents", contentsList);

            String requestJson = objectMapper.writeValueAsString(requestBody);
            HttpEntity<String> entity = new HttpEntity<>(requestJson, headers);

            log.info("Invoking external Google Gemini LLM API...");
            String responseJson = restTemplate.postForObject(apiUrl, entity, String.class);
            
            JsonNode rootNode = objectMapper.readTree(responseJson);
            JsonNode textNode = rootNode.path("candidates")
                    .path(0)
                    .path("content")
                    .path("parts")
                    .path(0)
                    .path("text");
            
            if (!textNode.isMissingNode()) {
                String text = textNode.asText();
                log.info("Successfully received recommendation response from Google Gemini API.");
                return text;
            } else {
                log.warn("Gemini API response structure unexpected. Node parts[0].text not found. Raw: {}", responseJson);
                return getFallbackAdvice();
            }
        } catch (Exception e) {
            log.error("Failed to fetch advice from Gemini API ({}). Returning fallback advice.", e.getMessage());
            return getFallbackAdvice();
        }
    }

    private String getFallbackAdvice() {
        return "VoltHome Enerji Tasarrufu Önerisi:\n" +
                "Şu anda yapay zeka servislerimize geçici bir süreliğine erişilemiyor. Ancak evinizdeki genel enerji tüketimini azaltmak için aşağıdaki temel adımları uygulayabilirsiniz:\n" +
                "1. Yüksek güç çeken cihazları (klima, fırın, bulaşık makinesi vb.) bütçe sınırınızı aşmamak adına kontrollü ve sırayla kullanın.\n" +
                "2. Cihazlarınızın anomali durumlarını (örneğin safe limit değerinin üzerindeki aşırı güç çekimleri) kontrol edin ve gerekirse teknik bakımlarını yaptırın.\n" +
                "3. Standby (bekleme) modundaki elektrikli aletleri prizden çekerek gereksiz güç sızıntılarının önüne geçin.";
    }
}
