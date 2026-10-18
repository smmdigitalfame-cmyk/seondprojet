/**
 * Media Upload Utility
 * Uses Lovable Cloud Storage (reel-media bucket) through a secure backend
 * uploader so client-side storage policies do not block thumbnail/graph uploads.
 */

import { getAuthSession, getDeviceFingerprint } from "@/lib/auth";

export interface UploadResponse {
  url: string;
}

/**
 * Upload a file to Lovable Cloud Storage
 * @param file - File to upload
 * @param onProgress - Optional progress callback (0-100)
 * @returns The permanent public URL of the uploaded file
 */
export async function uploadToCloudinary(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const session = getAuthSession();
  const key = session?.key;
  const deviceFp = session?.deviceFingerprint || getDeviceFingerprint();

  onProgress?.(10);

  if (!key || !deviceFp) {
    throw new Error("Please login again before uploading media.");
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const endpoint = `${supabaseUrl}/functions/v1/upload-media`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${anonKey}`,
      "apikey": anonKey,
      "Content-Type": file.type || "application/octet-stream",
      "X-Access-Key": key,
      "X-Device-Fp": deviceFp,
      "X-File-Name": encodeURIComponent(file.name || "upload"),
    },
    body: file,
  });

  onProgress?.(90);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.url) {
    const message = typeof payload?.error === "string" ? payload.error : "Upload failed";
    console.error("[Storage] Upload failed:", message);
    throw new Error(message);
  }

  onProgress?.(100);

  console.log("[Storage] Upload success:", payload.url);
  return payload.url;
}
