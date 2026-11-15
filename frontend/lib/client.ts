import { createClient, SupabaseClient } from '@supabase/supabase-js';
let client: SupabaseClient | undefined;
export function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Configure the public Supabase URL and anon key to sign in.');
  return client ??= createClient(url, key);
}
export async function api<T>(path: string, token: string, body?: unknown): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error('Configure NEXT_PUBLIC_API_URL.');
  const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${r.status})`);
  }
  return r.json();
}
export function upload(url: string, file: File, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.timeout = 180000;
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(100 * e.loaded / e.total)); };
    xhr.onerror = () => reject(new Error('Upload connection failed. Retry the same file.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Retry the same file.'));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}). If already uploaded, choose Verify upload.`));
    xhr.send(file);
  });
}
export type Video = { id: string; original_filename: string; status: string; use_case: string; upload_verified: boolean; playback_url?: string; error_message?: string };
export type Detection = { bbox: number[]; label: string; confidence: number; track_id: number | null; accepted: boolean };
export type Frame = { id: string; frame_number: number; timestamp_seconds: number; image_url: string; visibility_condition: string; detections_json: Detection[]; review_required: boolean; review_reason: string | null; review_status: string; model_version: string };
export type Investigation = { summary: string; total_frames: number; total_detections: number; average_confidence: number | null; miss_rate: number | null; metrics_json: { by_condition: Record<string, { frames: number; detections: number; review_frames: number }> } };
export const useCases = ['search and rescue','fire and smoke response','floods and natural disasters','collapsed buildings','cave and underground rescue','maritime rescue and fog','dangerous industrial inspection','remote drone inspection','war-zone or inaccessible environments'];
