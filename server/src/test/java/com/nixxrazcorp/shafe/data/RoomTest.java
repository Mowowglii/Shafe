package com.nixxrazcorp.shafe.data;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Proxy;
import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

class RoomTest {
    private static final Duration TTL = Duration.ofMinutes(15);
    private static final Duration WARNING_LEAD = Duration.ofMinutes(1);
    private static final Instant CREATED_AT = Instant.parse("2026-01-01T00:00:00Z");

    @Test
    void warnsOnceAfterFourteenMinutesAndExpiresAfterFifteen() {
        Room room = new Room(2, CREATED_AT);

        assertFalse(room.markExpirationWarningIfDue(CREATED_AT.plus(Duration.ofMinutes(13)), TTL, WARNING_LEAD));
        assertTrue(room.markExpirationWarningIfDue(CREATED_AT.plus(Duration.ofMinutes(14)), TTL, WARNING_LEAD));
        assertFalse(room.markExpirationWarningIfDue(
                CREATED_AT.plus(Duration.ofMinutes(14)).plusSeconds(30), TTL, WARNING_LEAD));
        assertFalse(room.tryExpire(CREATED_AT.plus(Duration.ofMinutes(14)).plusSeconds(59), TTL));
        assertTrue(room.tryExpire(CREATED_AT.plus(Duration.ofMinutes(15)), TTL));
        assertFalse(room.tryExpire(CREATED_AT.plus(Duration.ofMinutes(16)), TTL));
    }

    @Test
    void signalingActivityResetsWarningAndExpirationDeadline() {
        Room room = new Room(2, CREATED_AT);
        WebSocketSession session = mockSession();
        assertTrue(room.addSession(session, CREATED_AT, TTL));

        assertTrue(room.markExpirationWarningIfDue(CREATED_AT.plus(Duration.ofMinutes(14)), TTL, WARNING_LEAD));
        assertFalse(room.tryExpire(CREATED_AT.plus(Duration.ofMinutes(14)).plusSeconds(30), TTL));

        assertTrue(room.recordSignalingActivity(
                session, CREATED_AT.plus(Duration.ofMinutes(14)).plusSeconds(30), TTL));
        assertFalse(room.markExpirationWarningIfDue(CREATED_AT.plus(Duration.ofMinutes(28)), TTL, WARNING_LEAD));
        assertTrue(room.markExpirationWarningIfDue(
                CREATED_AT.plus(Duration.ofMinutes(28)).plusSeconds(30), TTL, WARNING_LEAD));
    }

    private WebSocketSession mockSession() {
        return (WebSocketSession) Proxy.newProxyInstance(
                WebSocketSession.class.getClassLoader(),
                new Class<?>[] { WebSocketSession.class },
                (proxy, method, args) -> switch (method.getName()) {
                    case "getId" -> "test-session";
                    case "equals" -> proxy == args[0];
                    case "hashCode" -> System.identityHashCode(proxy);
                    default -> null;
                });
    }
}
