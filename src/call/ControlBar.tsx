import { useState } from "react";
import { useMediaDeviceSelect, useTrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  NotebookPen,
  PhoneOff,
  Settings2,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { CAPTURE_RESOLUTION } from "./useCallRoom";

/** Screen sharing needs getDisplayMedia, which phones and tablets don't offer. */
const canShareScreen =
  typeof navigator !== "undefined" &&
  Boolean(navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices) &&
  !window.matchMedia("(pointer: coarse)").matches;

const deviceError = (what: string) => () =>
  toast.error(`We couldn't use your ${what}. Check your browser's permissions for this site.`);

interface ControlBarProps {
  notesOpen: boolean;
  onToggleNotes: () => void;
  onLeave: () => void;
  onEnd: () => Promise<void>;
  otherName: string;
}

export const ControlBar = ({ notesOpen, onToggleNotes, onLeave, onEnd, otherName }: ControlBarProps) => {
  const mic = useTrackToggle({ source: Track.Source.Microphone, onDeviceError: deviceError("microphone") });
  const camera = useTrackToggle({
    source: Track.Source.Camera,
    captureOptions: { resolution: CAPTURE_RESOLUTION },
    onDeviceError: deviceError("camera"),
  });
  const screen = useTrackToggle({
    source: Track.Source.ScreenShare,
    captureOptions: { audio: true, selfBrowserSurface: "exclude" },
    onDeviceError: (err) => {
      // Cancelling the browser's picker isn't an error worth showing.
      if ((err as { name?: string }).name !== "NotAllowedError") toast.error("Screen sharing couldn't start.");
    },
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  return (
    <div className="relative flex shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-stage-bar px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-3">
      <BarButton
        label={mic.enabled ? "Mute microphone" : "Unmute microphone"}
        active={mic.enabled}
        danger={!mic.enabled}
        disabled={mic.pending}
        onClick={() => void mic.toggle()}
      >
        {mic.enabled ? <Mic /> : <MicOff />}
      </BarButton>
      <BarButton
        label={camera.enabled ? "Turn camera off" : "Turn camera on"}
        active={camera.enabled}
        danger={!camera.enabled}
        disabled={camera.pending}
        onClick={() => void camera.toggle()}
      >
        {camera.enabled ? <Video /> : <VideoOff />}
      </BarButton>
      {canShareScreen && (
        <BarButton
          label={screen.enabled ? "Stop sharing screen" : "Share screen"}
          active={!screen.enabled}
          highlight={screen.enabled}
          disabled={screen.pending}
          onClick={() => void screen.toggle()}
        >
          {screen.enabled ? <MonitorX /> : <MonitorUp />}
        </BarButton>
      )}
      <BarButton label="Audio and video settings" active onClick={() => setSettingsOpen((v) => !v)} pressed={settingsOpen}>
        <Settings2 />
      </BarButton>
      <BarButton label={notesOpen ? "Hide my notes" : "Show my notes"} active onClick={onToggleNotes} pressed={notesOpen} highlight={notesOpen}>
        <NotebookPen />
      </BarButton>

      <div className="mx-1 h-8 w-px bg-white/10" aria-hidden="true" />

      <button
        type="button"
        onClick={onLeave}
        className="flex h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <PhoneOff className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Leave</span>
        <span className="sr-only sm:hidden">Leave call</span>
      </button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className="flex h-11 items-center rounded-full bg-destructive px-4 text-sm font-medium text-white hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            End<span className="hidden sm:inline">&nbsp;session</span>
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>End the session for both of you?</AlertDialogTitle>
          <AlertDialogDescription>
            This disconnects {otherName} too, and the session moves to your history. Your notes are saved and stay
            editable. To step out briefly instead, use Leave.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              destructive
              disabled={ending}
              onClick={async (e) => {
                e.preventDefault();
                setEnding(true);
                try {
                  await onEnd();
                } finally {
                  setEnding(false);
                }
              }}
            >
              {ending ? "Ending…" : "End session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {settingsOpen && <DeviceSettings onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

const BarButton = ({
  label,
  active,
  danger,
  highlight,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  highlight?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50 [&_svg]:h-5 [&_svg]:w-5",
      danger ? "bg-destructive hover:bg-destructive/90" : highlight ? "bg-primary hover:bg-primary/90" : active && "bg-white/10 hover:bg-white/20",
    )}
  >
    {children}
  </button>
);

const DeviceSettings = ({ onClose }: { onClose: () => void }) => {
  const mics = useMediaDeviceSelect({ kind: "audioinput" });
  const cams = useMediaDeviceSelect({ kind: "videoinput" });
  const speakers = useMediaDeviceSelect({ kind: "audiooutput" });

  const rows: { label: string; select: ReturnType<typeof useMediaDeviceSelect> }[] = [
    { label: "Microphone", select: mics },
    { label: "Camera", select: cams },
    { label: "Speaker", select: speakers },
  ];

  return (
    <div className="absolute bottom-full left-1/2 mb-3 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/10 bg-stage-bar p-4 text-white shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Audio and video</h2>
        <button type="button" onClick={onClose} aria-label="Close settings" className="rounded p-1 hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-3">
        {rows
          .filter((r) => r.select.devices.length > 0)
          .map(({ label, select }) => (
            <label key={label} className="block space-y-1 text-xs text-white/70">
              <span>{label}</span>
              <select
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-white [&>option]:text-black"
                value={select.activeDeviceId}
                onChange={(e) => void select.setActiveMediaDevice(e.target.value)}
              >
                {select.devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || label}
                  </option>
                ))}
              </select>
            </label>
          ))}
      </div>
    </div>
  );
};
