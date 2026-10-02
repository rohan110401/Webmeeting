import { useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Loader2 } from "lucide-react";
import { ParticipantView } from "./ParticipantView";

interface VideoStageProps {
  /** Display names by LiveKit identity (= user id). */
  names: Record<string, string>;
  otherName: string;
}

/**
 * Two-person layout. The other person fills the stage with your own camera
 * as picture-in-picture; while anyone shares their screen, the screen takes
 * the stage and both cameras move to a strip.
 */
export const VideoStage = ({ names, otherName }: VideoStageProps) => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const nameOf = (identity: string) => names[identity] || "Guest";
  const cameras = tracks.filter((t) => t.source === Track.Source.Camera);
  const local = cameras.find((t) => t.participant.isLocal);
  const remote = cameras.find((t) => !t.participant.isLocal);
  const screen = tracks.find((t) => t.source === Track.Source.ScreenShare);

  if (screen) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-3 lg:flex-row">
        <ParticipantView
          trackRef={screen}
          name={nameOf(screen.participant.identity)}
          fit="contain"
          className="min-h-0 flex-1 bg-black"
        />
        <div className="flex shrink-0 gap-3 lg:w-56 lg:flex-col">
          {remote && (
            <ParticipantView trackRef={remote} name={nameOf(remote.participant.identity)} compact className="aspect-video w-1/2 lg:w-full" />
          )}
          {local && <ParticipantView trackRef={local} name="You" mirror compact className="aspect-video w-1/2 lg:w-full" />}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 p-3">
      {remote ? (
        <ParticipantView trackRef={remote} name={nameOf(remote.participant.identity)} className="h-full w-full" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl bg-stage-tile text-center text-white/70">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          <p>Waiting for {otherName} to join…</p>
        </div>
      )}
      {local && (
        <ParticipantView
          trackRef={local}
          name="You"
          mirror
          compact
          className="absolute bottom-6 right-6 aspect-video w-32 shadow-xl sm:w-44 lg:w-56"
        />
      )}
    </div>
  );
};
