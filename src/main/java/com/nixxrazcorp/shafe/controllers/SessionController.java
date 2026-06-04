package com.nixxrazcorp.shafe.controllers;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.nixxrazcorp.shafe.data.FTSession;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;


@RestController
@RequestMapping("/api/sessions")
@CrossOrigin(origins = "*")
public class SessionController {
    
    private final ConcurrentHashMap<String, FTSession> activeSessions = new ConcurrentHashMap<>();

    @PostMapping
    public ResponseEntity<FTSession> createSession(){
        String uniqueRID = UUID.randomUUID().toString();

        FTSession session = new FTSession(
            uniqueRID,
            LocalDateTime.now(),
            true
        );

        activeSessions.put(uniqueRID, session);
        return ResponseEntity.ok(session);
    }

    @GetMapping("/{roomId}")
    public ResponseEntity<?> isActive(@PathVariable String roomId){
        FTSession session = activeSessions.get(roomId);

        if (session == null || !session.isActive()){
            return ResponseEntity.status(404).body("Error : this transfert session doesn't exists");
        }

        return ResponseEntity.ok(session);
    }
    
    
}
