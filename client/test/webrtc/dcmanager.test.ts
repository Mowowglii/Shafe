import { describe, expect, it, vi } from "vitest";
import { DataChannelManager } from "../../src/webrtc/datachannelmanager.js";

class MockDataChannel extends EventTarget {
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  readonly send = vi.fn<
    (data: string | Blob | ArrayBuffer | ArrayBufferView) => void
  >();

  constructor(public readyState: RTCDataChannelState = "open") {
    super();
  }
}

function asDataChannel(channel: MockDataChannel): RTCDataChannel {
  return channel as unknown as RTCDataChannel;
}

function customEventDetail<T>(event: Event): T {
  return (event as CustomEvent<T>).detail;
}

describe("DataChannelManager", () => {
  it("sets the low-buffer threshold when binding an already open channel", () => {
    const manager = new DataChannelManager();
    const channel = new MockDataChannel();

    manager.bindDataChannel(asDataChannel(channel));

    expect(channel.bufferedAmountLowThreshold).toBe(256 * 1024);
  });

  it("waits for a connecting channel to open before forwarding its events", () => {
    const manager = new DataChannelManager();
    const channel = new MockDataChannel("connecting");
    const received = vi.fn();
    manager.addEventListener("data-received", received);

    manager.bindDataChannel(asDataChannel(channel));
    channel.dispatchEvent(new Event("message"));
    expect(received).not.toHaveBeenCalled();

    channel.readyState = "open";
    channel.dispatchEvent(new Event("open"));
    const payload = new ArrayBuffer(4);
    channel.dispatchEvent(Object.assign(new Event("message"), { data: payload }));

    expect(received).toHaveBeenCalledOnce();
    expect(customEventDetail(received.mock.calls[0]![0])).toBe(payload);
  });

  it("forwards message payloads from an already open channel", () => {
    const manager = new DataChannelManager();
    const channel = new MockDataChannel();
    const received = vi.fn();
    const payload = new Uint8Array([1, 2, 3]);
    manager.addEventListener("data-received", received);

    manager.bindDataChannel(asDataChannel(channel));
    channel.dispatchEvent(Object.assign(new Event("message"), { data: payload }));

    expect(received).toHaveBeenCalledOnce();
    expect(customEventDetail(received.mock.calls[0]![0])).toBe(payload);
  });

  it("forwards channel errors with their error detail", () => {
    const manager = new DataChannelManager();
    const channel = new MockDataChannel();
    const failed = vi.fn();
    const error = new Error("channel failed");
    manager.addEventListener("data-channel-error", failed);

    manager.bindDataChannel(asDataChannel(channel));
    channel.dispatchEvent(Object.assign(new Event("error"), { error }));

    expect(failed).toHaveBeenCalledOnce();
    expect(customEventDetail(failed.mock.calls[0]![0])).toBe(error);
  });

  it("notifies when the channel closes and stops sending through it", async () => {
    const manager = new DataChannelManager();
    const channel = new MockDataChannel();
    const closed = vi.fn();
    manager.addEventListener("data-channel-closed", closed);
    manager.bindDataChannel(asDataChannel(channel));

    channel.dispatchEvent(new Event("close"));
    await manager.send(new Uint8Array([1]));

    expect(closed).toHaveBeenCalledOnce();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it("does nothing when asked to send without a bound channel", async () => {
    const manager = new DataChannelManager();

    await expect(manager.send(new Uint8Array([1, 2]))).resolves.toBeUndefined();
  });

  it("sends immediately when the buffered amount is at or below the high watermark", async () => {
    const manager = new DataChannelManager();
    const channel = new MockDataChannel();
    const chunk = new Uint8Array([1, 2, 3]);
    manager.bindDataChannel(asDataChannel(channel));

    channel.bufferedAmount = 1024 * 1024;
    await manager.send(chunk);
    channel.bufferedAmount = 1024 * 1024 + 1;
    const pendingSend = manager.send(chunk);

    expect(channel.send).toHaveBeenCalledTimes(1);
    channel.dispatchEvent(new Event("bufferedamountlow"));
    await pendingSend;

    expect(channel.send).toHaveBeenCalledTimes(2);
    expect(channel.send).toHaveBeenLastCalledWith(chunk);
  });

  it("waits for the buffered amount low event before sending", async () => {
    const manager = new DataChannelManager();
    const channel = new MockDataChannel();
    const chunk = new Uint8Array([4, 5, 6]);
    manager.bindDataChannel(asDataChannel(channel));
    channel.bufferedAmount = 1024 * 1024 + 1;

    const pendingSend = manager.send(chunk);

    expect(channel.send).not.toHaveBeenCalled();
    channel.dispatchEvent(new Event("bufferedamountlow"));
    await pendingSend;

    expect(channel.send).toHaveBeenCalledOnce();
    expect(channel.send).toHaveBeenCalledWith(chunk);
  });
});