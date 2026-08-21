package com.volthome.core.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.volthome.core.config.JwtTokenProvider;
import com.volthome.core.model.jpa.Home;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

@Service
public class TelemetryWebSocketHandler extends TextWebSocketHandler {
    private static final Logger log = LoggerFactory.getLogger(TelemetryWebSocketHandler.class);

    private final List<WebSocketSession> sessions = new CopyOnWriteArrayList<>();
    private final JwtTokenProvider tokenProvider;
    private final HomeService homeService;
    private final ObjectMapper objectMapper;

    @Autowired
    public TelemetryWebSocketHandler(JwtTokenProvider tokenProvider,
                                     @Lazy HomeService homeService,
                                     ObjectMapper objectMapper) {
        this.tokenProvider = tokenProvider;
        this.homeService = homeService;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        // Extract token parameter from query string
        String query = session.getUri().getQuery();
        String token = null;
        if (query != null && query.contains("token=")) {
            token = query.split("token=")[1].split("&")[0];
        }

        // Validate token
        if (token == null || !tokenProvider.validateToken(token)) {
            log.warn("Unauthorized WebSocket handshake attempt rejected. Session ID: {}", session.getId());
            session.close(CloseStatus.BAD_DATA);
            return;
        }

        // Resolve user identity and cache their allowed home IDs
        String username = tokenProvider.getUsernameFromJwt(token);
        List<Home> userHomes = homeService.getAllHomes(username);
        Set<Long> allowedHomeIds = userHomes.stream().map(Home::getId).collect(Collectors.toSet());

        session.getAttributes().put("username", username);
        session.getAttributes().put("allowedHomeIds", allowedHomeIds);

        sessions.add(session);
        log.info("WebSocket authenticated for user [{}]. Session ID: {} | Active Clients: {}", 
                 username, session.getId(), sessions.size());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
        log.info("WebSocket connection closed. Session ID: {} | Active Clients: {}", session.getId(), sessions.size());
    }

    /**
     * Broadcasts a text message (JSON telemetry) to all connected WebSocket clients
     * that are authorized to view the target home.
     */
    public void broadcast(String message) {
        if (sessions.isEmpty()) {
            return;
        }

        try {
            // Read homeId from the telemetry message payload
            Map<?, ?> payload = objectMapper.readValue(message, Map.class);
            Number homeIdNum = (Number) payload.get("homeId");
            if (homeIdNum == null) {
                return;
            }
            Long homeId = homeIdNum.longValue();

            TextMessage textMessage = new TextMessage(message);
            for (WebSocketSession session : sessions) {
                if (session.isOpen()) {
                    @SuppressWarnings("unchecked")
                    Set<Long> allowedHomeIds = (Set<Long>) session.getAttributes().get("allowedHomeIds");
                    
                    // Only dispatch if client is authorized to monitor this home
                    if (allowedHomeIds != null && allowedHomeIds.contains(homeId)) {
                        try {
                            session.sendMessage(textMessage);
                        } catch (IOException e) {
                            log.error("Failed to send WebSocket message to session {}: {}", session.getId(), e.getMessage());
                            sessions.remove(session); // Clean up stale session
                        }
                    }
                } else {
                    sessions.remove(session);
                }
            }
        } catch (Exception e) {
            log.error("Failed to parse telemetry message payload for WebSocket dispatch filter: {}", e.getMessage());
        }
    }
}
