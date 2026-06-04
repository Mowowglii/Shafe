package com.nixxrazcorp.shafe.data;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class FTSession {
    private String roomId;
    private LocalDateTime createdAt;
    private boolean isActive;
}
