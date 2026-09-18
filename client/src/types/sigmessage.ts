export type SignalingMessage = {
    type : "offer" | "answer" | "icecandidate" | "error" | "offer-answer-finish";
    payload : string;
}