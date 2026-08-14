package com.nixxrazcorp.shafe.Service;

import com.nixxrazcorp.shafe.data.Room;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

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
}