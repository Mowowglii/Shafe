package com.nixxrazcorp.shafe.WebSocket;

import java.io.IOException;
import java.util.List;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.nixxrazcorp.shafe.Service.RoomManagerService;


@Component
public class SignalingHandler extends TextWebSocketHandler{

    private final RoomManagerService roomManagerService;

    public SignalingHandler(RoomManagerService roomManagerService) {
        this.roomManagerService = roomManagerService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session){
        String roomId = recoverRoomId(session);
        if (roomId != null){
            // Note : Modify the RoomManagerService to throw errors and replace this block by a try{...}catch...
            if (!roomManagerService.joinRoom(roomId, session)){
                System.err.println("Room Couldn't be joined");
            }
        } else {
            System.err.println("Error in query");
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status){
        String roomId = recoverRoomId(session);
        if (roomId != null){
            roomManagerService.leaveRoom(roomId, session);
        } else {
            System.err.println("Error in query");
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message){
        String roomId = recoverRoomId(session);
        if (roomId != null){
            List<WebSocketSession> listOfSessions = roomManagerService.getOtherActiveSessions(roomId, session);

            for (WebSocketSession ws : listOfSessions){
                try{
                    ws.sendMessage(message);
                } catch (IOException e){
                    System.err.println("Message Couldn't been sent :" + e.getMessage());
                    roomManagerService.leaveRoom(roomId, ws);
                }
            }
        }
    }

    private String recoverRoomId(WebSocketSession session){
        String roomId = null;
        String query = session.getUri().getQuery();
        
        if (query != null && query.contains("roomId=")){
            roomId = query.split("roomId=")[1].split("&")[0];
        }
        return roomId;
    }
}
