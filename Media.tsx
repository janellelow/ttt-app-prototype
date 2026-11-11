import { forwardRef, useEffect, useRef, useState } from "react";
import { formatClock } from "../lib/format";
import { useSignedUrl, type Bucket } from "../lib/storage";
import { Icon } from "./Icon";

/** Compact audio player: play button, progress bar, time. */
export function AudioPill({ bucket, path, label }: { bucket: Bucket; path: string; label: string }) {
  const url = useSignedUrl(bucket, path);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime);
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, [url]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const pct = duration ? Math.min(100, (time / duration) * 100) : 0;

  return (
    <div className="audio-pill">
      <button
        className="icon-btn icon-btn--sage icon-btn--sm"
        onClick={toggle}
        disabled={!url}
        aria-label={`${playing ? "Pause" : "Play"} ${label}`}
      >
        <Icon name={playing ? "pause" : "play"} size={14} />
      </button>
      <div className="progress grow" style={{ height: 4 }}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="tiny muted">{formatClock(duration ? duration - time : time)}</span>
      {url ? <audio ref={audio} src={url} preload="metadata" /> : null}
    </div>
  );
}

/** Video or audio from a private bucket, with a forwarded ref for seeking. */
export const PrivatePlayer = forwardRef<HTMLVideoElement & HTMLAudioElement, {
  bucket: Bucket;
  path: string;
  kind: "audio" | "video";
  label: string;
}>(function PrivatePlayer({ bucket, path, kind, label }, ref) {
  const url = useSignedUrl(bucket, path);
  if (!url) {
    return (
      <div className="media-box">
        <div className="media-placeholder">
          <Icon name="play" size={22} />
        </div>
      </div>
    );
  }
  return (
    <div className="media-box">
      {kind === "video" ? (
        <video ref={ref} src={url} controls playsInline preload="metadata" aria-label={label} />
      ) : (
        <audio ref={ref} src={url} controls preload="metadata" aria-label={label} style={{ width: "100%", margin: 12, maxWidth: "calc(100% - 24px)" }} />
      )}
    </div>
  );
});

export function PrivateImage({ bucket, path, alt }: { bucket: Bucket; path: string; alt: string }) {
  const url = useSignedUrl(bucket, path);
  return (
    <div className="media-box">
      {url ? <img src={url} alt={alt} /> : <div className="media-placeholder"><Icon name="photo" /></div>}
    </div>
  );
}
