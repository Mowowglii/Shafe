package com.nixxrazcorp.shafe.controllers;

import com.nixxrazcorp.shafe.dto.RoomResponse;
import com.nixxrazcorp.shafe.Service.RoomManagerService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {
    private static final Logger log = LoggerFactory.getLogger(RoomController.class);

    private final RoomManagerService roomManagerService;

    public RoomController(RoomManagerService roomManagerService) {
        this.roomManagerService = roomManagerService;
    }

    @GetMapping("/health")
    public ResponseEntity<Void> health() {
        return ResponseEntity.ok().build();
    }

    @PostMapping
    public ResponseEntity<RoomResponse> createRoom() {
        String roomId;

        while (true) {
            roomId = UUID.randomUUID().toString();
            if (roomManagerService.tryRegisterRoom(roomId)) {
                break;
            }
            log.debug("Generated room ID collision; retrying");
        }

        log.info("Created room {}", roomId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new RoomResponse(roomId, "initiator"));
    }
}