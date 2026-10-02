import { useEffect, useRef, useState } from "react";
import {
  useAudioPlayback,
  useConnectionQualityIndicator,
  useConnectionState,
  useIsEncrypted,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
} from "@livekit/components-react";
import { ConnectionQuality, ConnectionState, RoomEvent } from "livekit-client";
import { Lock, LockOpen, Signal, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Reconnecting, the other person dropping out, and decryption problems. */
export const ConnectionBanner = ({ otherName }: { otherName: string }) => {
  const room = useRoomContext();
  const state = useConnectionState();
  const remotes = useRemoteParticipants();
  const hadOther = useRef(false);
  const [otherLeft, setOtherLeft] = useState(false);
  const [decryptProblem, setDecryptProblem] = useState(false);

  useEffect(() => {
    if (remotes.length > 0) {
      hadOther.current = true;
      setOtherLeft(false);
    } else if (hadOther.current) {
      setOtherLeft(true);
    }
  }, [remotes.length]);

  useEffect(() => {
    const onError = () => setDecryptProblem(true);
    room.on(RoomEvent.EncryptionError, onError);
    return () => {
      room.off(RoomEvent.EncryptionError, onError);
    };
  }, [room]);

  let message: string | null = null;
  let tone: "warn" | "info" = "info";
  if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) {
    message = "Connection interrupted — reconnecting…";
    tone = "warn";
  } else if (decryptProblem) {
    message = "There was a problem decrypting the call. If video or sound stops, both of you should leave and rejoin.";
    tone = "warn";
  } else if (otherLeft) {
    message = `${otherName} left the call. They can rejoin at any time.`;
  }
  if (!message) return null;

  return (
    <div
      role="status"
      className={cn(
        "shrink-0 px-4 py-2 text-center text-sm",
        tone === "warn" ? "bg-amber-500/15 text-amber-200" : "bg-white/5 text-white/80",
      )}
    >
      {message}
    </div>
  );
};

/** Mobile browsers block sound until someone taps the page. */
export const StartAudioPrompt = () => {
  const room = useRoomContext();
  const { canPlayAudio, startAudio } = useAudioPlayback(room);
  if (canPlayAudio) return null;
  return (
    <button
      type="button"
      onClick={() => void startAudio()}
      className="absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg"
    >
      <Volume2 className="h-4 w-4" aria-hidden="true" />
      Tap to turn on sound
    </button>
  );
};

export const EncryptionBadge = () => {
  const { localParticipant } = useLocalParticipant();
  const encrypted = useIsEncrypted(localParticipant);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
        encrypted ? "bg-success/15 text-emerald-300" : "bg-amber-500/15 text-amber-200",
      )}
      title={encrypted ? "Only the two of you can see and hear this call" : "Encryption is starting"}
    >
      {encrypted ? <Lock className="h-3 w-3" aria-hidden="true" /> : <LockOpen className="h-3 w-3" aria-hidden="true" />}
      <span className="hidden sm:inline">{encrypted ? "End-to-end encrypted" : "Securing…"}</span>
    </span>
  );
};

const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  [ConnectionQuality.Excellent]: "Excellent connection",
  [ConnectionQuality.Good]: "Good connection",
  [ConnectionQuality.Poor]: "Poor connection",
  [ConnectionQuality.Lost]: "Connection lost",
  [ConnectionQuality.Unknown]: "Checking connection",
};

export const QualityIndicator = () => {
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });
  return (
    <span
      className={cn(
        "inline-flex items-center",
        quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost ? "text-amber-300" : "text-white/60",
      )}
      title={QUALITY_LABEL[quality]}
      aria-label={QUALITY_LABEL[quality]}
    >
      <Signal className="h-4 w-4" />
    </span>
  );
};
