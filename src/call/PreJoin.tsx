import { useEffect, useRef, useState } from "react";
import {
  createAudioAnalyser,
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
  Room,
} from "livekit-client";
import { Lock, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAPTURE_RESOLUTION, type JoinChoices } from "./useCallRoom";

function deviceErrorMessage(err: unknown, device: "camera" | "microphone"): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return `Your browser blocked the ${device}. Allow it from the icon in the address bar, then try again.`;
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return `No ${device} was found.`;
  if (name === "NotReadableError") return `The ${device} is being used by another app.`;
  return `We couldn't start the ${device}.`;
}

const selectClass =
  "h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>option]:text-black";

interface PreJoinProps {
  title: string;
  subtitle: string;
  busy: boolean;
  error?: string | null;
  onJoin: (choices: JoinChoices) => void;
}

/** Check your camera and microphone before going in. */
export const PreJoin = ({ title, subtitle, busy, error, onJoin }: PreJoinProps) => {
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDeviceId, setVideoDeviceId] = useState<string>();
  const [audioDeviceId, setAudioDeviceId] = useState<string>();
  const [videoTrack, setVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [audioTrack, setAudioTrack] = useState<LocalAudioTrack | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const videoEl = useRef<HTMLVideoElement>(null);

  // Camera preview.
  useEffect(() => {
    if (!cameraOn) return;
    let track: LocalVideoTrack | null = null;
    let cancelled = false;
    setCameraError(null);
    createLocalVideoTrack({ deviceId: videoDeviceId, resolution: CAPTURE_RESOLUTION })
      .then((t) => {
        if (cancelled) return t.stop();
        track = t;
        setVideoTrack(t);
      })
      .catch((err) => !cancelled && setCameraError(deviceErrorMessage(err, "camera")));
    return () => {
      cancelled = true;
      track?.stop();
      setVideoTrack(null);
    };
  }, [cameraOn, videoDeviceId]);

  useEffect(() => {
    const el = videoEl.current;
    if (!videoTrack || !el) return;
    videoTrack.attach(el);
    return () => {
      videoTrack.detach(el);
    };
  }, [videoTrack]);

  // Microphone check with a level meter.
  useEffect(() => {
    if (!micOn) return;
    let track: LocalAudioTrack | null = null;
    let cancelled = false;
    setMicError(null);
    createLocalAudioTrack({ deviceId: audioDeviceId })
      .then((t) => {
        if (cancelled) return t.stop();
        track = t;
        setAudioTrack(t);
      })
      .catch((err) => !cancelled && setMicError(deviceErrorMessage(err, "microphone")));
    return () => {
      cancelled = true;
      track?.stop();
      setAudioTrack(null);
      setLevel(0);
    };
  }, [micOn, audioDeviceId]);

  useEffect(() => {
    if (!audioTrack) return;
    const { calculateVolume, cleanup } = createAudioAnalyser(audioTrack);
    const id = window.setInterval(() => setLevel(calculateVolume()), 100);
    return () => {
      window.clearInterval(id);
      void cleanup();
    };
  }, [audioTrack]);

  // Device lists (labels are available once permission is granted).
  useEffect(() => {
    if (!videoTrack && !audioTrack) return;
    Room.getLocalDevices("videoinput").then(setVideoDevices).catch(() => undefined);
    Room.getLocalDevices("audioinput").then(setAudioDevices).catch(() => undefined);
  }, [videoTrack, audioTrack]);

  const join = () => {
    // Release the preview devices; the call opens its own.
    videoTrack?.stop();
    audioTrack?.stop();
    onJoin({
      cameraOn: cameraOn && !cameraError,
      micOn: micOn && !micError,
      videoDeviceId: videoDeviceId ?? videoTrack?.mediaStreamTrack.getSettings().deviceId,
      audioDeviceId: audioDeviceId ?? audioTrack?.mediaStreamTrack.getSettings().deviceId,
    });
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl items-center gap-8 px-4 py-8 md:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-stage-tile">
          {cameraOn && videoTrack ? (
            <video ref={videoEl} className="h-full w-full -scale-x-100 object-cover" muted playsInline autoPlay />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white/60">
              {cameraOn ? (cameraError ?? "Starting camera…") : "Camera is off"}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-3 bg-gradient-to-t from-black/60 to-transparent p-4">
            <RoundToggle on={micOn} onClick={() => setMicOn((v) => !v)} labelOn="Turn microphone off" labelOff="Turn microphone on">
              {micOn ? <Mic /> : <MicOff />}
            </RoundToggle>
            <RoundToggle on={cameraOn} onClick={() => setCameraOn((v) => !v)} labelOn="Turn camera off" labelOff="Turn camera on">
              {cameraOn ? <Video /> : <VideoOff />}
            </RoundToggle>
          </div>
        </div>
        {micOn && !micError && (
          <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <div className="h-full rounded-full bg-success transition-[width] duration-100" style={{ width: `${Math.min(100, level * 300)}%` }} />
            </div>
          </div>
        )}
        {micError && <p className="mt-3 text-sm text-amber-300">{micError}</p>}
      </div>

      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
          <p className="mt-1 text-sm text-white/60">{subtitle}</p>
        </div>
        {videoDevices.length > 1 && (
          <label className="block space-y-1.5 text-sm text-white/80">
            <span>Camera</span>
            <select className={selectClass} value={videoDeviceId ?? ""} onChange={(e) => setVideoDeviceId(e.target.value || undefined)}>
              <option value="">Default</option>
              {videoDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "Camera"}
                </option>
              ))}
            </select>
          </label>
        )}
        {audioDevices.length > 1 && (
          <label className="block space-y-1.5 text-sm text-white/80">
            <span>Microphone</span>
            <select className={selectClass} value={audioDeviceId ?? ""} onChange={(e) => setAudioDeviceId(e.target.value || undefined)}>
              <option value="">Default</option>
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "Microphone"}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-red-200" role="alert">
            {error}
          </p>
        )}
        <Button size="lg" className="w-full" onClick={join} disabled={busy}>
          {busy ? "Joining…" : "Join now"}
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-white/50">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          End-to-end encrypted. Only the two of you can see and hear the call.
        </p>
      </div>
    </div>
  );
};

const RoundToggle = ({
  on,
  onClick,
  labelOn,
  labelOff,
  children,
}: {
  on: boolean;
  onClick: () => void;
  labelOn: string;
  labelOff: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={on ? labelOn : labelOff}
    aria-pressed={on}
    className={cn(
      "flex h-12 w-12 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white [&_svg]:h-5 [&_svg]:w-5",
      on ? "bg-white/15 text-white hover:bg-white/25" : "bg-destructive text-white hover:bg-destructive/90",
    )}
  >
    {children}
  </button>
);
