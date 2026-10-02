import { useIsMuted, useIsSpeaking, VideoTrack, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { isTrackReference } from "@livekit/components-react";
import { Track } from "livekit-client";
import { MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

interface ParticipantViewProps {
  trackRef: TrackReferenceOrPlaceholder;
  name: string;
  /** Mirror your own camera, as people expect. */
  mirror?: boolean;
  /** Screen shares are shown whole; cameras fill the tile. */
  fit?: "cover" | "contain";
  className?: string;
  compact?: boolean;
}

export const ParticipantView = ({ trackRef, name, mirror, fit = "cover", className, compact }: ParticipantViewProps) => {
  const isScreen = trackRef.source === Track.Source.ScreenShare;
  const videoMuted = useIsMuted(trackRef);
  const micMuted = useIsMuted({ participant: trackRef.participant, source: Track.Source.Microphone });
  const speaking = useIsSpeaking(trackRef.participant);
  const showVideo = isTrackReference(trackRef) && !videoMuted;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-stage-tile ring-2 ring-transparent transition-shadow",
        speaking && !isScreen && "ring-success/80",
        className,
      )}
    >
      {showVideo ? (
        <VideoTrack
          trackRef={trackRef}
          className={cn("h-full w-full", fit === "cover" ? "object-cover" : "object-contain", mirror && "-scale-x-100")}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span
            className={cn(
              "flex items-center justify-center rounded-full bg-white/10 font-semibold text-white",
              compact ? "h-10 w-10 text-sm" : "h-20 w-20 text-2xl",
            )}
            aria-hidden="true"
          >
            {initials(name)}
          </span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs text-white">
        {!isScreen && micMuted && <MicOff className="h-3.5 w-3.5 shrink-0 text-red-300" aria-label="Microphone off" />}
        <span className="truncate">{isScreen ? `${name}'s screen` : name}</span>
      </div>
    </div>
  );
};
