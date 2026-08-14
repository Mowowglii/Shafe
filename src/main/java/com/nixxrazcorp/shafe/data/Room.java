package com.nixxrazcorp.shafe.data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReentrantReadWriteLock;

import org.springframework.web.socket.WebSocketSession;

public final class Room{
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();

    private ArrayList<FTSession> sessionList = new ArrayList<FTSession>();
    private boolean isFull = false;
    private String roomID;
    private int capacity;    
    private boolean isAsleep = true;
    private int activeCounter = 0;
    private int sleepingCounter = 0;

    public Room(){
    }

    public Room(int max_size, String id){
        this.roomID = id;
        this.capacity = max_size;
    }

    public String getRoomId(){
        lock.readLock().lock();
        try {
            return this.roomID;
        } finally {
            lock.readLock().unlock();
        }
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
                return false;
            }

            // Check if a sleeping session could be replaced
            if (this.sleepingCounter > 0){
                // Replace the sleeping session
                FTSession session = this.findSleepingSession();
                session.setWsSession(ws);
                session.setCreatedAt(LocalDateTime.now());
                session.setActive(true);

                // Decrement sleepingcounter because of replacement
                this.sleepingCounter -= 1;
            } else { // Naturally Add the Session
                FTSession session = new FTSession(
                    ws,
                    LocalDateTime.now(),
                    true
                );
                
                this.sessionList.add(session);
            }

            // Increment active counter 
            this.activeCounter += 1;
            this.updateState();
            return true;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public boolean deleteSession(WebSocketSession ws){
        lock.writeLock().lock();
        try{
            FTSession sessionToDelete = this.findSessionByWs(ws);
            if (sessionToDelete != null && sessionToDelete.isActive()){
                sessionToDelete.setActive(false);

                // Update Room State
                this.activeCounter -= 1;
                this.sleepingCounter += 1;
                this.updateState();
                return true;
            }
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
}