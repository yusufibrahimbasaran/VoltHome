package com.volthome.core.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class TelemetryWebSocketHandler extends TextWebSocketHandler {
    private static final Logger log = LoggerFactory.getLogger(TelemetryWebSocketHandler.class);

    // Thread-safe collection to track active WebSocket client sessions
    private final List<WebSocketSession> sessions = new CopyOnWriteArrayList<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
        log.info("WebSocket connection established. Session ID: {} | Active Clients: {}", session.getId(), sessions.size());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
        log.info("WebSocket connection closed. Session ID: {} | Active Clients: {}", session.getId(), sessions.size());
    }

    /**
     * Broadcasts a text message (JSON telemetry) to all connected WebSocket clients.
     */
    public void broadcast(String message) {
        if (sessions.isEmpty()) {
            return;
        }

        TextMessage textMessage = new TextMessage(message);
        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                try {
                    session.sendMessage(textMessage);
                } catch (IOException e) {
                    log.error("Failed to send WebSocket message to session {}: {}", session.getId(), e.getMessage());
                    sessions.remove(session); // Clean up stale session
                }
            } else {
                sessions.remove(session);
            }
        }
    }
}
