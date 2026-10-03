import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeerManagerService } from "../src/signaling/pm.service.js";
import type { SignalingMessage } from "../src/types/sigmessage.js";

class MockPeerConnection {
  static instances: MockPeerConnection[] = [];

  onconnectionstatechange: ((event: Event) => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  connectionState: RTCPeerConnectionState = "new";
  createDataChannelResult: RTCDataChannel | undefined;
  createOfferResult: RTCSessionDescriptionInit | undefined = {
    type: "offer",
    sdp: "offer-sdp",
  };
  createAnswerResult: RTCSessionDescriptionInit | undefined = {
    type: "answer",
    sdp: "answer-sdp",
  };
  readonly createDataChannel = vi.fn<(label: string) => RTCDataChannel | undefined>();
  readonly createOffer = vi.fn<() => Promise<RTCSessionDescriptionInit | undefined>>();
  readonly createAnswer = vi.fn<() => Promise<RTCSessionDescriptionInit | undefined>>();
  readonly setLocalDescription = vi.fn<(description: RTCSessionDescriptionInit) => Promise<void>>();
  readonly setRemoteDescription = vi.fn<(description: RTCSessionDescriptionInit) => Promise<void>>();
  readonly addIceCandidate = vi.fn<(candidate: RTCIceCandidateInit) => Promise<void>>();
  readonly close = vi.fn();

  constructor(readonly configuration?: RTCConfiguration) {
    this.createDataChannel.mockImplementation(() => this.createDataChannelResult);
    this.createOffer.mockImplementation(async () => this.createOfferResult);
    this.createAnswer.mockImplementation(async () => this.createAnswerResult);
    this.setLocalDescription.mockResolvedValue();
    this.setRemoteDescription.mockResolvedValue();
    this.addIceCandidate.mockResolvedValue();
    MockPeerConnection.instances.push(this);
  }

  static reset() {
    this.instances.length = 0;
  }
}

const peerInstances = MockPeerConnection.instances;

function customEventDetail<T>(event: Event): T {
  return (event as CustomEvent<T>).detail;
}

function makeCandidate(candidate: string): RTCIceCandidate {
  return { candidate, sdpMid: "0", sdpMLineIndex: 0 } as RTCIceCandidate;
}

describe("PeerManagerService", () => {
  beforeEach(() => {
    MockPeerConnection.reset();
    vi.stubGlobal(
      "RTCPeerConnection",
      MockPeerConnection,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a peer connection with the supplied configuration", () => {
    const configuration: RTCConfiguration = {
      iceServers: [{ urls: "stun:stun.example.test" }],
    };

    new PeerManagerService(configuration);

    expect(peerInstances).toHaveLength(1);
    expect(peerInstances[0]?.configuration).toBe(configuration);
  });

  it("dispatches connection-state and recovered-data-channel events", () => {
    const service = new PeerManagerService({});
    const peer = peerInstances[0]!;
    const connectionListener = vi.fn();
    const channel = { label: "incoming" } as RTCDataChannel;
    const channelListener = vi.fn();
    service.addEventListener("connection-change", connectionListener);
    service.addEventListener("datachannel-recovered", channelListener);

    peer.connectionState = "connected";
    peer.onconnectionstatechange?.(
      new Event("connectionstatechange") as Parameters<
        NonNullable<RTCPeerConnection["onconnectionstatechange"]>
      >[0],
    );
    peer.ondatachannel?.(
      { channel } as Parameters<NonNullable<RTCPeerConnection["ondatachannel"]>>[0],
    );

    expect(customEventDetail(connectionListener.mock.calls[0]![0])).toBe("connected");
    expect(customEventDetail(channelListener.mock.calls[0]![0])).toBe(channel);
  });

  it("creates an offer, configures its data channel, and emits the offer", async () => {
    const service = new PeerManagerService({});
    const peer = peerInstances[0]!;
    const channel = { binaryType: "blob" } as RTCDataChannel;
    peer.createDataChannelResult = channel;
    const generatedSignals: SignalingMessage[] = [];
    const recoveredChannels: RTCDataChannel[] = [];
    service.addEventListener("signal-generated", (event) => {
      generatedSignals.push(customEventDetail(event));
    });
    service.addEventListener("datachannel-recovered", (event) => {
      recoveredChannels.push(customEventDetail(event));
    });

    await service.generateOffer();

    expect(peer.createDataChannel).toHaveBeenCalledWith("file-transfer");
    expect(channel.binaryType).toBe("arraybuffer");
    expect(recoveredChannels).toEqual([channel]);
    expect(peer.createOffer).toHaveBeenCalledOnce();
    expect(peer.setLocalDescription).toHaveBeenCalledWith({
      type: "offer",
      sdp: "offer-sdp",
    });
    expect(generatedSignals).toEqual([
      { type: "offer", payload: JSON.stringify({ type: "offer", sdp: "offer-sdp" }) },
    ]);
  });

  it("emits dc-not-created and stops when it cannot create the offer data channel", async () => {
    const service = new PeerManagerService({});
    const peer = peerInstances[0]!;
    const failed = vi.fn();
    service.addEventListener("dc-not-created", failed);

    await service.generateOffer();

    expect(failed).toHaveBeenCalledOnce();
    expect(peer.createOffer).not.toHaveBeenCalled();
  });

  it("emits offer-creation-failed when creating an offer returns no description", async () => {
    const service = new PeerManagerService({});
    const peer = peerInstances[0]!;
    peer.createDataChannelResult = { binaryType: "blob" } as RTCDataChannel;
    peer.createOfferResult = undefined;
    const failed = vi.fn();
    service.addEventListener("offer-creation-failed", failed);

    await service.generateOffer();

    expect(failed).toHaveBeenCalledOnce();
    expect(peer.setLocalDescription).not.toHaveBeenCalled();
  });

  it("answers a received offer after setting it as the remote description", async () => {
    const service = new PeerManagerService({});
    const peer = peerInstances[0]!;
    const offer = { type: "offer", sdp: "remote-offer" };
    const generatedSignals: SignalingMessage[] = [];
    service.addEventListener("signal-generated", (event) => {
      generatedSignals.push(customEventDetail(event));
    });

    await service.handleSignalingMessage({
      type: "offer",
      payload: JSON.stringify(offer),
    });

    expect(peer.setRemoteDescription).toHaveBeenCalledWith(offer);
    expect(peer.createAnswer).toHaveBeenCalledOnce();
    expect(peer.setLocalDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "answer-sdp",
    });
    expect(generatedSignals).toEqual([
      { type: "answer", payload: JSON.stringify({ type: "answer", sdp: "answer-sdp" }) },
    ]);
  });

  it("emits answer-creation-failed when creating an answer returns no description", async () => {
    const service = new PeerManagerService({});
    const peer = peerInstances[0]!;
    peer.createAnswerResult = undefined;
    const failed = vi.fn();
    service.addEventListener("answer-creation-failed", failed);

    await service.handleSignalingMessage({
      type: "offer",
      payload: JSON.stringify({ type: "offer", sdp: "remote-offer" }),
    });

    expect(failed).toHaveBeenCalledOnce();
    expect(peer.setLocalDescription).not.toHaveBeenCalled();
  });

  it("sets the remote answer and signals that the offer-answer exchange is complete", async () => {
    const service = new PeerManagerService({});
    const peer = peerInstances[0]!;
    const answer = { type: "answer", sdp: "remote-answer" };
    const generatedSignals: SignalingMessage[] = [];
    service.addEventListener("signal-generated", (event) => {
      generatedSignals.push(customEventDetail(event));
    });

    await service.handleSignalingMessage({
      type: "answer",
      payload: JSON.stringify(answer),
    });

    expect(peer.setRemoteDescription).toHaveBeenCalledWith(answer);
    expect(generatedSignals).toEqual([{ type: "offer-answer-finish", payload: "" }]);
  });

  it("buffers ICE candidates until offer-answer-finish and then emits them in order", async () => {
    const service = new PeerManagerService({});
    const peer = peerInstances[0]!;
    const firstCandidate = makeCandidate("candidate:one");
    const secondCandidate = makeCandidate("candidate:two");
    const generatedSignals: SignalingMessage[] = [];
    service.addEventListener("signal-generated", (event) => {
      generatedSignals.push(customEventDetail(event));
    });

    peer.onicecandidate?.(
      { candidate: firstCandidate } as Parameters<
        NonNullable<RTCPeerConnection["onicecandidate"]>
      >[0],
    );
    peer.onicecandidate?.(
      { candidate: secondCandidate } as Parameters<
        NonNullable<RTCPeerConnection["onicecandidate"]>
      >[0],
    );
    peer.onicecandidate?.(
      { candidate: null } as Parameters<NonNullable<RTCPeerConnection["onicecandidate"]>>[0],
    );

    expect(generatedSignals).toEqual([]);

    await service.handleSignalingMessage({ type: "offer-answer-finish", payload: "" });

    expect(generatedSignals).toEqual([
      { type: "icecandidate", payload: JSON.stringify(firstCandidate) },
      { type: "icecandidate", payload: JSON.stringify(secondCandidate) },
    ]);
  });

  it("emits new ICE candidates immediately after flushing the candidate buffer", async () => {
    const service = new PeerManagerService({});
    const peer = peerInstances[0]!;
    const candidate = makeCandidate("candidate:after-finish");
    const generatedSignals: SignalingMessage[] = [];
    service.addEventListener("signal-generated", (event) => {
      generatedSignals.push(customEventDetail(event));
    });

    await service.handleSignalingMessage({ type: "offer-answer-finish", payload: "" });
    peer.onicecandidate?.(
      { candidate } as Parameters<NonNullable<RTCPeerConnection["onicecandidate"]>>[0],
    );

    expect(generatedSignals).toEqual([
      { type: "icecandidate", payload: JSON.stringify(candidate) },
    ]);
  });

  it("adds a received ICE candidate to the peer connection", async () => {
    const service = new PeerManagerService({});
    const peer = peerInstances[0]!;
    const candidate = { candidate: "candidate:remote", sdpMid: "0", sdpMLineIndex: 0 };

    await service.handleSignalingMessage({
      type: "icecandidate",
      payload: JSON.stringify(candidate),
    });

    expect(peer.addIceCandidate).toHaveBeenCalledWith(candidate);
  });

  it("restarts the peer connection and uses the replacement configuration", () => {
    const service = new PeerManagerService({});
    const previousPeer = peerInstances[0]!;
    const nextConfiguration: RTCConfiguration = {
      iceServers: [{ urls: "stun:replacement.example.test" }],
    };

    service.restart(nextConfiguration);

    expect(previousPeer.close).toHaveBeenCalledOnce();
    expect(peerInstances).toHaveLength(2);
    expect(peerInstances[1]?.configuration).toBe(nextConfiguration);
  });

  it("keeps the current configuration when restarting without a replacement", () => {
    const configuration: RTCConfiguration = {
      iceServers: [{ urls: "stun:current.example.test" }],
    };
    const service = new PeerManagerService(configuration);

    service.restart();

    expect(peerInstances[1]?.configuration).toBe(configuration);
  });

  it("ignores error and unsupported signaling messages", async () => {
    const service = new PeerManagerService({});
    const peer = peerInstances[0]!;

    await service.handleSignalingMessage({ type: "error", payload: "failed" });

    expect(peer.setRemoteDescription).not.toHaveBeenCalled();
    expect(peer.addIceCandidate).not.toHaveBeenCalled();
    expect(peer.createAnswer).not.toHaveBeenCalled();
  });
});