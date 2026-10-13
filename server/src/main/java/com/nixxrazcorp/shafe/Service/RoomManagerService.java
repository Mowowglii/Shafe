package com.nixxrazcorp.shafe.Service;

import com.nixxrazcorp.shafe.data.FTSession;
import com.nixxrazcorp.shafe.data.Room;
import com.nixxrazcorp.shafe.dto.SigMessage;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomManagerService {
    private static final Logger log = LoggerFactory.getLogger(RoomManagerService.class);
    private static final int DEFAULT_CAPACITY = 2;
    private final ConcurrentHashMap<String, Room> activeRooms = new ConcurrentHashMap<>();
    private final Duration roomTtl;
    private final Duration warningLead;

    public enum JoinResult {
        JOINED,
        ROOM_NOT_FOUND,
        ROOM_FULL
    }

    public RoomManagerService(
            @Value("${shafe.rooms.ttl:15m}") Duration roomTtl,
            @Value("${shafe.rooms.warning-before-expiration:1m}") Duration warningLead) {
        if (roomTtl.isZero() || roomTtl.isNegative() || warningLead.isNegative()
                || warningLead.compareTo(roomTtl) >= 0) {
            throw new IllegalArgumentException("Room TTL must be positive and warning lead must be between zero and TTL");
        }
        this.roomTtl = roomTtl;
        this.warningLead = warningLead;
    }

    public boolean tryRegisterRoom(String roomId) {
        Room room = new Room(DEFAULT_CAPACITY);
        boolean registered = activeRooms.putIfAbsent(roomId, room) == null;
        if (!registered) {
            log.debug("Room {} already exists; registration rejected", roomId);
        }
        return registered; // Room created if and only if roomId is unique
    }

    public Room getRoom(String roomId) {
        Room room = activeRooms.get(roomId);
        if (room == null) {
            log.debug("Room {} was not found", roomId);
        }
        return room;
    }

    public JoinResult joinRoom(String roomId, WebSocketSession session) {
        Room room = activeRooms.get(roomId);
        if (room == null) {
            log.warn("Cannot join missing room {} (session {})", roomId, sessionId(session));
            return JoinResult.ROOM_NOT_FOUND;
        }
        if (room.isFull()) {
            log.warn("Cannot join full room {} (session {})", roomId, sessionId(session));
            return JoinResult.ROOM_FULL;
        }
        boolean joined = room.addSession(session, Instant.now(), roomTtl);
        if (joined) {
            log.info("Session {} joined room {}", sessionId(session), roomId);
            if (room.isExpirationWarningSent()) {
                sendExpirationWarning(roomId, room, List.of(session));
            }
            return JoinResult.JOINED;
        } else {
            log.warn("Session {} could not join room {}", sessionId(session), roomId);
            if (room.isExpired()) {
                expireRoom(roomId, room);
                return JoinResult.ROOM_NOT_FOUND;
            }
            return JoinResult.ROOM_FULL;
        }
    }

    public void leaveRoom(String roomId, WebSocketSession session) {
        Room room = activeRooms.get(roomId);
        if (room != null) {
            boolean removed = room.deleteSession(session);
            if (removed) {
                log.info("Session {} left room {}", sessionId(session), roomId);
            } else {
                log.debug("Session {} was not active in room {}", sessionId(session), roomId);
            }
            
            // Retain empty rooms until their inactivity TTL expires, allowing the warning window.
        } else {
            log.debug("Cannot leave missing room {} (session {})", roomId, sessionId(session));
        }
    }

    public List<WebSocketSession> getOtherActiveSessions(String roomId, WebSocketSession ws){
        if (ws == null){
            log.warn("Cannot find other room sessions for a null WebSocket session");
            return List.of();
        }

        Room room = this.getRoom(roomId);
        if (room == null){
            return List.of();
        }
        
        ArrayList<WebSocketSession> listOfWs = new ArrayList<>();
        List<FTSession> listOfSessions = room.getSessions();

        for (FTSession session : listOfSessions){
            if (session.isActive() && !session.getWsSession().equals(ws)){
                listOfWs.add(session.getWsSession());
            }
        }

        log.debug("Found {} active peer(s) in room {} for session {}", listOfWs.size(), roomId, sessionId(ws));
        return listOfWs;
    }

    public boolean recordSignalingActivity(String roomId, WebSocketSession session) {
        Room room = activeRooms.get(roomId);
        if (room == null) {
            return false;
        }
        boolean recorded = room.recordSignalingActivity(session, Instant.now(), roomTtl);
        if (!recorded && room.isExpired()) {
            expireRoom(roomId, room);
        }
        return recorded;
    }

    @Scheduled(fixedDelayString = "${shafe.rooms.cleanup-interval:1s}")
    public void removeExpiredRooms() {
        Instant now = Instant.now();
        activeRooms.forEach((roomId, room) -> {
            if (room.tryExpire(now, roomTtl)) {
                expireRoom(roomId, room);
            } else if (room.markExpirationWarningIfDue(now, roomTtl, warningLead)) {
                sendExpirationWarning(roomId, room, room.getActiveSessions());
            }
        });
    }

    private void expireRoom(String roomId, Room room) {
        if (activeRooms.remove(roomId, room)) {
            log.info("Removed inactive room {} after {}", roomId, roomTtl);
            closeExpiredRoomSessions(roomId, room);
        }
    }

    private void sendExpirationWarning(String roomId, Room room, List<WebSocketSession> sessions) {
        long secondsRemaining = room.remainingTtlSeconds(Instant.now(), roomTtl);
        TextMessage warning = new SigMessage("room-expiring", Long.toString(secondsRemaining)).toTextMessage();
        log.info("Warning {} active session(s) that room {} expires in {} seconds",
                sessions.size(), roomId, secondsRemaining);
        for (WebSocketSession session : sessions) {
            try {
                if (session.isOpen()) {
                    session.sendMessage(warning);
                }
            } catch (IOException e) {
                log.warn("Failed to send expiration warning for room {} to session {}", roomId, sessionId(session), e);
            }
        }
    }

    private void closeExpiredRoomSessions(String roomId, Room room) {
        CloseStatus status = new CloseStatus(CloseStatus.NORMAL.getCode(), "Room expired due to inactivity");
        for (WebSocketSession session : room.getActiveSessions()) {
            try {
                if (session.isOpen()) {
                    session.close(status);
                }
            } catch (IOException e) {
                log.warn("Failed to close expired room {} session {}", roomId, sessionId(session), e);
            }
        }
    }

    private String sessionId(WebSocketSession session) {
        return session == null ? "unknown" : session.getId();
    }
}