package com.nixxrazcorp.shafe.controller;

import com.nixxrazcorp.shafe.dto.RoomResponse;
import com.nixxrazcorp.shafe.Service.RoomManagerService;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {
    private final RoomManagerService roomManagerService;

    public RoomController(RoomManagerService roomManagerService) {
        this.roomManagerService = roomManagerService;
    }

    @PostMapping
    public ResponseEntity<RoomResponse> createRoom() {
        String roomId;

        do {
            roomId = UUID.randomUUID().toString();
        } while (!roomManagerService.tryRegisterRoom(roomId)); // Make sure we create the room

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new RoomResponse(roomId));
    }
}