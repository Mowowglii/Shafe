package com.nixxrazcorp.shafe.Service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.lang.reflect.Proxy;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;

import com.nixxrazcorp.shafe.dto.SigMessage;

class RoomManagerServiceTest {
    private final RoomManagerService service =
            new RoomManagerService(Duration.ofMinutes(15), Duration.ofMinutes(1));

    @Test
    void deletesRoomImmediatelyWhenLastSessionLeaves() {
        String roomId = "empty-room";
        WebSocketSession lastSession = mockSession("last-session", new AtomicReference<>());
        service.tryRegisterRoom(roomId);
        assertEquals(RoomManagerService.JoinResult.JOINED, service.joinRoom(roomId, lastSession));

        service.leaveRoom(roomId, lastSession);

        assertNull(service.getRoom(roomId));
    }

    @Test
    void promotesTheOnlyRemainingSessionToInitiator() throws Exception {
        String roomId = "remaining-session-room";
        AtomicReference<WebSocketMessage<?>> notification = new AtomicReference<>();
        WebSocketSession departingSession = mockSession("departing-session", new AtomicReference<>());
        WebSocketSession remainingSession = mockSession("remaining-session", notification);
        service.tryRegisterRoom(roomId);
        assertEquals(RoomManagerService.JoinResult.JOINED, service.joinRoom(roomId, departingSession));
        assertEquals(RoomManagerService.JoinResult.JOINED, service.joinRoom(roomId, remainingSession));

        service.leaveRoom(roomId, departingSession);

        assertNotNull(service.getRoom(roomId));
        assertEquals(1, service.getRoom(roomId).getActiveSessions().size());
        assertEquals(remainingSession, service.getRoom(roomId).getActiveSessions().getFirst());
        assertNotNull(notification.get());
        SigMessage promotion = new tools.jackson.databind.ObjectMapper()
                .readValue(((TextMessage) notification.get()).getPayload(), SigMessage.class);
        assertEquals("peer-left", promotion.getType());
        assertEquals("initiator", promotion.getPayload());
    }

    private WebSocketSession mockSession(String id, AtomicReference<WebSocketMessage<?>> notification) {
        return (WebSocketSession) Proxy.newProxyInstance(
                WebSocketSession.class.getClassLoader(),
                new Class<?>[] { WebSocketSession.class },
                (proxy, method, args) -> switch (method.getName()) {
                    case "getId" -> id;
                    case "isOpen" -> true;
                    case "sendMessage" -> {
                        notification.set((WebSocketMessage<?>) args[0]);
                        yield null;
                    }
                    case "equals" -> proxy == args[0];
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "toString" -> id;
                    default -> null;
                });
    }
}
