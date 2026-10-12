package com.nixxrazcorp.shafe.Service;

import com.nixxrazcorp.shafe.data.FTSession;
import com.nixxrazcorp.shafe.data.Room;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomManagerService {
    private static final Logger log = LoggerFactory.getLogger(RoomManagerService.class);
    private static final int DEFAULT_CAPACITY = 2;
    private final ConcurrentHashMap<String, Room> activeRooms = new ConcurrentHashMap<>();

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

    public boolean joinRoom(String roomId, WebSocketSession session) {
        Room room = activeRooms.get(roomId);
        if (room == null) {
            log.warn("Cannot join missing room {} (session {})", roomId, sessionId(session));
            return false;
        }
        if (room.isFull()) {
            log.warn("Cannot join full room {} (session {})", roomId, sessionId(session));
            return false;
        }
        boolean joined = room.addSession(session);
        if (joined) {
            log.info("Session {} joined room {}", sessionId(session), roomId);
        } else {
            log.warn("Session {} could not join room {}", sessionId(session), roomId);
        }
        return joined;
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
            
            // Clean up empty sleeping rooms to prevent memory leaks
            if (room.isAsleep()) {
                if (activeRooms.remove(roomId, room)) {
                    log.debug("Removed empty room {}", roomId);
                }
            }
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

    private String sessionId(WebSocketSession session) {
        return session == null ? "unknown" : session.getId();
    }
}