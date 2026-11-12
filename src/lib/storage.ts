import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Bucket = "lesson-media" | "community-media" | "private-media";

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** "audio/webm;codecs=opus" -> "audio/webm" */
export function baseMime(type: string): string {
  return type.split(";")[0]!.trim().toLowerCase();
}

/**
 * Upload a file into a folder of a private bucket. Returns the stored path.
 * The folder decides who can read it (see supabase/migrations/..._security.sql).
 */
export async function uploadFile(bucket: Bucket, folder: string, file: Blob): Promise<string> {
  const mime = baseMime(file.type || "application/octet-stream");
  const ext = EXT[mime] ?? "bin";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

/** A short-lived link to a private file (null while loading or if not allowed). */
export function useSignedUrl(bucket: Bucket, path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!path) return;
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (alive) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [bucket, path]);
  return url;
}

export function mediaKindOf(file: File): "audio" | "video" | "image" | null {
  const mime = baseMime(file.type);
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return null;
}
