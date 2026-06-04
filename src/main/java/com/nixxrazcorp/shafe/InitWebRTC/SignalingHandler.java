package com.nixxrazcorp.shafe.InitWebRTC;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;


@Component
public class SignalingHandler extends TextWebSocketHandler{

    private final ConcurrentHashMap<String, CopyOnWriteArrayList<WebSocketSession>> rooms = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session){
        String query = session.getUri().getQuery();
        if (query != null && query.contains("roomId=")){
            String roomId = query.split("roomId=")[1].split("&")[0];

            session.getAttributes().put("roomId", roomId);

            rooms.computeIfAbsent(roomId, k -> new CopyOnWriteArrayList<>())
            .addIfAbsent(session);
        } else {
            System.err.println("Error in Query");
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status){
        rooms.forEach((roomId, sessionList) -> {
            sessionList.remove(session);
            if (sessionList.isEmpty()){
                rooms.remove(roomId);
            }
        });
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message){
        
        // Recover the room of the session
        String roomId = (String) session.getAttributes().get("roomId");

        // Recover the sessions in the room
        CopyOnWriteArrayList<WebSocketSession> sessions = rooms.get(roomId);

        for (WebSocketSession webSocketSession : sessions){
            if (webSocketSession.isOpen() && !webSocketSession.getId().equals(session.getId())){
                try {
                    webSocketSession.sendMessage(message);
                } catch (IOException e){
                    System.err.println("Couldn't send message : " + e.getMessage());
                }
            }
        }
    }

}
