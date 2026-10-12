export type SignalingMessage = {
    type : "offer" | "answer" | "icecandidate" | "error" | "offer-answer-finish" | "room-expiring";
    payload : string;
}