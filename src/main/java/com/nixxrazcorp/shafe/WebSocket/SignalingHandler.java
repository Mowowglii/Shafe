package com.nixxrazcorp.shafe.WebSocket;

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
        String query = session.getUri().getQuery();
        if (query != null && query.contains("roomId=")){
            String roomId = query.split("roomId=")[1].split("&")[0];
            
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
        String query = session.getUri().getQuery();
        if (query != null && query.contains("roomId=")){
            String roomId = query.split("roomId=")[1].split("&")[0];
            roomManagerService.leaveRoom(roomId, session);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message){
        
    }

}
