package com.nixxrazcorp.shafe.data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReentrantReadWriteLock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.WebSocketSession;

public final class Room{
    private static final Logger log = LoggerFactory.getLogger(Room.class);
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();

    private ArrayList<FTSession> sessionList = new ArrayList<FTSession>();
    private boolean isFull = false;
    private int capacity;    
    private boolean isAsleep = true;
    private int activeCounter = 0;
    private int sleepingCounter = 0;

    public Room(){
    }

    public Room(int max_size){
        this.capacity = max_size;
    }

    public List<FTSession> getSessions(){
        lock.readLock().lock();
        try{
            return new ArrayList<FTSession>(this.sessionList);
        } finally {
            lock.readLock().unlock();
        }
    }

    public boolean isAsleep(){
        lock.readLock().lock();
        try {
            return this.isAsleep;
        } finally {
            lock.readLock().unlock();
        }
    }

    public boolean isFull(){
        lock.readLock().lock();
        try {
            return this.isFull;
        } finally {
            lock.readLock().unlock();
        }
    }

    public boolean addSession(WebSocketSession ws){
        lock.writeLock().lock();
        try {
            if (this.isFull){
                log.debug("Rejected session {} because room is full", sessionId(ws));
                return false;
            }

            if (ws == null){
                log.warn("Rejected a null WebSocket session");
                return false;
            }

            // Retrieve eventual sleeping session
            FTSession session = this.findSleepingSession();

            // Check if a sleeping session could be replaced
            if (this.sleepingCounter > 0){
                // Replace the sleeping session
                session.setWsSession(ws);
                session.setCreatedAt(LocalDateTime.now());
                session.setActive(true);

                // Decrement sleepingcounter because of replacement
                this.sleepingCounter -= 1;
            } else { // Naturally Add the Session
                session = new FTSession(
                    ws,
                    LocalDateTime.now(),
                    true
                );
                
                this.sessionList.add(session);
            }

            // Increment active counter 
            this.activeCounter += 1;
            this.updateState();
            log.debug("Added session {}; active={}, sleeping={}, capacity={}",
                    sessionId(ws), activeCounter, sleepingCounter, capacity);
            return true;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public boolean deleteSession(WebSocketSession ws){
        lock.writeLock().lock();
        try{
            if (ws == null){
                log.warn("Cannot remove a null WebSocket session");
                return false;
            }

            FTSession sessionToDelete = this.findSessionByWs(ws);
            if (sessionToDelete != null && sessionToDelete.isActive()){
                sessionToDelete.setActive(false);

                // Update Room State
                this.activeCounter -= 1;
                this.sleepingCounter += 1;
                this.updateState();
                log.debug("Marked session {} inactive; active={}, sleeping={}",
                        sessionId(ws), activeCounter, sleepingCounter);
                return true;
            }
            log.debug("Session {} was not found or was already inactive", sessionId(ws));
            return false;
        } finally {
            lock.writeLock().unlock();
        }
    }

    private void updateState(){
        this.isAsleep = this.activeCounter == 0;
        this.isFull = this.sessionList.size() == this.capacity && this.activeCounter == this.capacity;
    }

    private FTSession findSleepingSession(){
        for (FTSession session : this.sessionList){
            if (!session.isActive()){
                return session;
            }
        }
        return null;
    }

    private FTSession findSessionByWs(WebSocketSession ws){
        if (ws == null){
            return null;
        }

        for (FTSession session : this.sessionList){
            if (ws.equals(session.getWsSession())){
                return session;
            }
        }
        return null;
    }

    private String sessionId(WebSocketSession session) {
        return session == null ? "unknown" : session.getId();
    }
}