import { supabase } from "@/integrations/supabase/client";

const BUCKET = "transaction-attachments";
const MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL = 3600;

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const BLOCKED_EXT = ["svg", "xml", "html", "htm"];

export async function uploadAttachment(file: File, folder: "income" | "expense"): Promise<string> {
  if (!ALLOWED_MIME.includes(file.type)) {
    throw new Error("Only JPEG, PNG, GIF, or WebP images are allowed");
  }
  if (file.size > MAX_BYTES) throw new Error("Image must be 5 MB or smaller");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  if (BLOCKED_EXT.includes(ext)) throw new Error("This file type is not allowed");
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  // Store the storage path (not a URL). Display code uses getAttachmentSignedUrl.
  return path;
}

/** Extracts a storage path from either a stored path or a legacy public URL. */
export function attachmentPathFromStored(value: string): string | null {
  if (!value) return null;
  const marker = `/${BUCKET}/`;
  const i = value.indexOf(marker);
  if (i !== -1) return value.substring(i + marker.length);
  // Assume it's already a path
  return value;
}

/** Back-compat alias. */
export function attachmentPathFromUrl(url: string): string | null {
  return attachmentPathFromStored(url);
}

export async function getAttachmentSignedUrl(stored: string): Promise<string | null> {
  const path = attachmentPathFromStored(stored);
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function deleteAttachment(stored: string) {
  const path = attachmentPathFromStored(stored);
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
