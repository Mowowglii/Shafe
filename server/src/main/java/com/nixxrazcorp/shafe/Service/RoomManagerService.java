package com.nixxrazcorp.shafe.Service;

import com.nixxrazcorp.shafe.data.FTSession;
import com.nixxrazcorp.shafe.data.Room;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomManagerService {
    private static final int DEFAULT_CAPACITY = 2;
    private final ConcurrentHashMap<String, Room> activeRooms = new ConcurrentHashMap<>();

    public boolean tryRegisterRoom(String roomId) {
        Room room = new Room(DEFAULT_CAPACITY);
        return activeRooms.putIfAbsent(roomId, room) == null; // Room created if and only if roomId is unique
    }

    public Room getRoom(String roomId) {
        return activeRooms.get(roomId);
    }

    public boolean joinRoom(String roomId, WebSocketSession session) {
        Room room = activeRooms.get(roomId);
        if (room == null || room.isFull()) {
            return false;
        }
        return room.addSession(session);
    }

    public void leaveRoom(String roomId, WebSocketSession session) {
        Room room = activeRooms.get(roomId);
        if (room != null) {
            room.deleteSession(session);
            
            // Clean up empty sleeping rooms to prevent memory leaks
            if (room.isAsleep()) {
                activeRooms.remove(roomId);
            }
        }
    }

    public List<WebSocketSession> getOtherActiveSessions(String roomId, WebSocketSession ws){
        if (ws == null){
            return null;
        }

        Room room = this.getRoom(roomId);
        if (room == null){
            return null;
        }
        
        ArrayList<WebSocketSession> listOfWs = new ArrayList<>();
        List<FTSession> listOfSessions = room.getSessions();

        for (FTSession session : listOfSessions){
            if (session.isActive() && !session.getWsSession().equals(ws)){
                listOfWs.add(session.getWsSession());
            }
        }

        return listOfWs;
    }

}