package com.nixxrazcorp.shafe.data;

import java.time.LocalDateTime;
import java.util.Objects;
import org.springframework.web.socket.WebSocketSession;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class FTSession {
    private WebSocketSession wsSession;
    private LocalDateTime createdAt;
    private boolean isActive;

    @Override
    public boolean equals(Object o){
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        FTSession ftSession = (FTSession) o;
        return Objects.equals(wsSession, ftSession.wsSession);
    }

    @Override
    public int hashCode() {
        return Objects.hash(wsSession);
    }
}
