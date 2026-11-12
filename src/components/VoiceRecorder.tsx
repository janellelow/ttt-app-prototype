import { useEffect, useRef, useState } from "react";
import { formatClock } from "../lib/format";
import { haptic } from "../lib/telegram";
import { Icon } from "./Icon";

const MAX_SECONDS = 5 * 60;

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
}

/**
 * Record a voice note with the microphone. Calls onRecorded with the audio
 * once the person stops. Tap once to start, again to stop.
 */
export function VoiceRecorder({ onRecorded, disabled }: { onRecorded: (blob: Blob) => void; disabled?: boolean }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);

  useEffect(() => () => stopTracks(), []);

  // stop automatically at the time limit
  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, seconds]);

  function stopTracks() {
    if (timer.current) window.clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }

  async function start() {
    setError(null);
    const mimeType = pickMime();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice notes aren't supported on this device yet.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType });
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stopTracks();
        const blob = new Blob(chunks.current, { type: mimeType.split(";")[0] });
        if (blob.size > 0) onRecorded(blob);
      };
      rec.start();
      recorder.current = rec;
      setSeconds(0);
      setRecording(true);
      haptic();
      timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Microphone access was blocked. Allow it in your phone's settings for Telegram.");
    }
  }

  function stop() {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    setRecording(false);
    haptic("success");
  }

  return (
    <div className="row" style={{ gap: 8 }}>
      {recording ? <span className="small" style={{ color: "var(--danger)", fontWeight: 700 }}>● {formatClock(seconds)}</span> : null}
      <button
        type="button"
        className="icon-btn icon-btn--sage"
        style={recording ? { background: "var(--danger)" } : undefined}
        onClick={recording ? stop : start}
        disabled={disabled}
        aria-label={recording ? "Stop recording" : "Record voice note"}
      >
        <Icon name={recording ? "stop" : "mic"} size={20} />
      </button>
      {error ? <span className="error tiny">{error}</span> : null}
    </div>
  );
}
