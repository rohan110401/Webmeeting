import { useCallback, useEffect, useRef, useState } from "react";
import {
  DisconnectReason,
  ExternalE2EEKeyProvider,
  isE2EESupported,
  Room,
  RoomEvent,
  VideoPresets,
} from "livekit-client";
import E2EEWorker from "livekit-client/e2ee-worker?worker";
import { api, ApiError } from "@/lib/api";

export interface JoinChoices {
  cameraOn: boolean;
  micOn: boolean;
  videoDeviceId?: string;
  audioDeviceId?: string;
}

export type CallPhase =
  | { kind: "prejoin" }
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "left" }
  | { kind: "ended" }
  | { kind: "replaced" }
  | { kind: "error"; message: string; code?: string; opensAt?: string };

/** 540p keeps E2EE light enough for older phones and stays inside the free tier's bandwidth. */
export const CAPTURE_RESOLUTION = VideoPresets.h540.resolution;

/**
 * One end-to-end encrypted LiveKit room for a session. The token and the
 * session's encryption key come from the video-token function, which checks
 * the caller is a participant inside the join window.
 */
export function useCallRoom(sessionId: string) {
  const [phase, setPhase] = useState<CallPhase>({ kind: "prejoin" });
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const workerRef = useRef<Worker | null>(null);
  // Set when we disconnect on purpose, so the Disconnected handler doesn't
  // report it as a lost connection.
  const intentional = useRef<"left" | "ended" | null>(null);

  const teardown = useCallback(() => {
    roomRef.current?.removeAllListeners();
    void roomRef.current?.disconnect();
    workerRef.current?.terminate();
    roomRef.current = null;
    workerRef.current = null;
    setRoom(null);
  }, []);

  useEffect(() => teardown, [teardown]);

  const join = useCallback(
    async (choices: JoinChoices) => {
      if (!isE2EESupported()) {
        setPhase({
          kind: "error",
          code: "E2EE_UNSUPPORTED",
          message:
            "This browser can't join encrypted calls. Please use an up-to-date Chrome, Edge, Safari or Firefox.",
        });
        return;
      }
      teardown();
      intentional.current = null;
      setPhase({ kind: "connecting" });

      try {
        const access = await api.videoToken(sessionId);

        const keyProvider = new ExternalE2EEKeyProvider();
        const worker = new E2EEWorker();
        workerRef.current = worker;
        const next = new Room({
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: { resolution: CAPTURE_RESOLUTION },
          publishDefaults: { simulcast: true },
          e2ee: { keyProvider, worker },
        });
        roomRef.current = next;

        await keyProvider.setKey(access.e2eeKey);
        await next.setE2EEEnabled(true);

        next.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          if (intentional.current === "left") return;
          if (intentional.current === "ended") return;
          if (reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.ROOM_CLOSED) {
            setPhase({ kind: "ended" });
          } else if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
            setPhase({ kind: "replaced" });
          } else if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
            setPhase({ kind: "ended" });
          } else {
            setPhase({ kind: "error", message: "The connection was lost. You can rejoin." });
          }
          setRoom(null);
        });

        await next.connect(access.serverUrl, access.token);
        setRoom(next);
        setPhase({ kind: "connected" });

        // Publish after connecting; a missing or blocked device shouldn't keep
        // anyone out of the call.
        await Promise.allSettled([
          next.localParticipant.setMicrophoneEnabled(choices.micOn, { deviceId: choices.audioDeviceId }),
          next.localParticipant.setCameraEnabled(choices.cameraOn, {
            deviceId: choices.videoDeviceId,
            resolution: CAPTURE_RESOLUTION,
          }),
        ]);
      } catch (err) {
        teardown();
        if (err instanceof ApiError) {
          setPhase({
            kind: "error",
            code: err.code,
            message: err.message,
            opensAt: typeof err.details.opensAt === "string" ? err.details.opensAt : undefined,
          });
        } else {
          setPhase({
            kind: "error",
            message: "We couldn't connect to the call. Check your connection and try again.",
          });
        }
      }
    },
    [sessionId, teardown],
  );

  const leave = useCallback(async () => {
    intentional.current = "left";
    await roomRef.current?.disconnect();
    teardown();
    setPhase({ kind: "left" });
  }, [teardown]);

  /** After the session was ended by us: disconnect quietly and show the end screen. */
  const markEnded = useCallback(async () => {
    intentional.current = "ended";
    await roomRef.current?.disconnect();
    teardown();
    setPhase({ kind: "ended" });
  }, [teardown]);

  const backToLobby = useCallback(() => setPhase({ kind: "prejoin" }), []);

  return { phase, room, join, leave, markEnded, backToLobby };
}
