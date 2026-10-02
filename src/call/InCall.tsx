import { useEffect, useRef, useState } from "react";
import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import type { Room } from "livekit-client";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { ChevronDown } from "lucide-react";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { NotesEditor } from "@/notes/NotesEditor";
import type { AutosaveHandle } from "@/notes/useAutosave";
import { ConnectionBanner, EncryptionBadge, QualityIndicator, StartAudioPrompt } from "./CallStatus";
import { ControlBar } from "./ControlBar";
import { VideoStage } from "./VideoStage";

interface InCallProps {
  room: Room;
  title: string;
  otherName: string;
  names: Record<string, string>;
  startedAt: number;
  endsAt: number;
  notes: AutosaveHandle;
  onLeave: () => void;
  onEnd: () => Promise<void>;
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

const Timer = ({ startedAt, endsAt }: { startedAt: number; endsAt: number }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const over = now > endsAt;
  return (
    <span className={cn("font-mono text-sm tabular-nums", over ? "text-amber-300" : "text-white/70")} role="timer">
      {clock(now - startedAt)}
      {over && <span className="ml-1 font-sans text-xs">· over time</span>}
    </span>
  );
};

export const InCall = ({ room, title, otherName, names, startedAt, endsAt, notes, onLeave, onEnd }: InCallProps) => {
  const isDesktop = useIsDesktop();
  const notesPanel = useRef<ImperativePanelHandle>(null);
  const [notesOpen, setNotesOpen] = useState(isDesktop);

  const toggleNotes = () => {
    if (isDesktop) {
      const panel = notesPanel.current;
      if (!panel) return;
      if (panel.isCollapsed()) panel.expand();
      else panel.collapse();
    } else {
      setNotesOpen((v) => !v);
    }
  };

  const notesCard = (
    <div className="flex h-full min-h-0 flex-col rounded-2xl bg-stage-tile p-4 text-white">
      <NotesEditor notes={notes} tone="stage" className="flex-1" />
    </div>
  );

  return (
    <RoomContext.Provider value={room}>
      <div className="relative flex h-dvh flex-col overflow-hidden bg-stage text-white">
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <EncryptionBadge />
            <QualityIndicator />
            <Timer startedAt={startedAt} endsAt={endsAt} />
          </div>
        </header>
        <ConnectionBanner otherName={otherName} />

        <div className="relative min-h-0 flex-1">
          {isDesktop ? (
            <PanelGroup direction="horizontal" autoSaveId="call-notes-layout">
              <Panel minSize={45} order={1}>
                <VideoStage names={names} otherName={otherName} />
              </Panel>
              <PanelResizeHandle
                className="group flex w-2 items-center justify-center focus-visible:outline-none"
                aria-label="Resize notes"
              >
                <span className="h-10 w-1 rounded-full bg-white/15 transition-colors group-hover:bg-white/40 group-data-[resize-handle-state=drag]:bg-primary" />
              </PanelResizeHandle>
              <Panel
                ref={notesPanel}
                order={2}
                collapsible
                collapsedSize={0}
                minSize={20}
                maxSize={50}
                defaultSize={30}
                onCollapse={() => setNotesOpen(false)}
                onExpand={() => setNotesOpen(true)}
              >
                {/* Stays mounted when collapsed, so nothing typed is lost. */}
                <div className={cn("h-full py-3 pr-3", !notesOpen && "invisible")}>{notesCard}</div>
              </Panel>
            </PanelGroup>
          ) : (
            <>
              <VideoStage names={names} otherName={otherName} />
              {/* Bottom sheet; always mounted so the editor keeps its state. */}
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 z-10 flex h-[65%] flex-col rounded-t-2xl border-t border-white/10 bg-stage-bar p-3 shadow-2xl transition-transform duration-200",
                  notesOpen ? "translate-y-0" : "pointer-events-none translate-y-full",
                )}
                aria-hidden={!notesOpen}
              >
                <button
                  type="button"
                  onClick={() => setNotesOpen(false)}
                  className="mx-auto mb-2 flex items-center gap-1 rounded-full px-3 py-1 text-xs text-white/60 hover:bg-white/10"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  Hide notes
                </button>
                <div className="min-h-0 flex-1">{notesCard}</div>
              </div>
            </>
          )}
        </div>

        <ControlBar notesOpen={notesOpen} onToggleNotes={toggleNotes} onLeave={onLeave} onEnd={onEnd} otherName={otherName} />
        <RoomAudioRenderer />
        <StartAudioPrompt />
      </div>
    </RoomContext.Provider>
  );
};
