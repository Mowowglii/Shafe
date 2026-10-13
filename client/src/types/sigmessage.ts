export type SignalingMessage = {
    type : "offer" | "answer" | "icecandidate" | "error" | "offer-answer-finish" | "room-expiring" | "peer-ready" | "peer-left";
    payload : string;
}