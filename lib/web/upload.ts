"use client";

/** Upload a file with real progress events (XHR). Throws ApiError on failure. */

export interface UploadProgress {
  percent: number;
  state: "uploading" | "done" | "error";
}

export function uploadWithProgress(
  path: string,
  file: File,
  kind: string,
  onProgress: (p: UploadProgress) => void,
): Promise<{ asset: { id: string; url: string; width: number; height: number; kind: string } }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress({ percent: Math.round((e.loaded / e.total) * 100), state: "uploading" });
      }
    };
    xhr.onload = () => {
      let json: { asset?: { id: string; url: string; width: number; height: number; kind: string }; error?: string; code?: string } | null = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && json?.asset) {
        onProgress({ percent: 100, state: "done" });
        resolve(json as never);
      } else {
        onProgress({ percent: 0, state: "error" });
        const err = new Error(json?.error ?? "Image upload failed. Please try again.") as Error & { status?: number; code?: string };
        err.status = xhr.status;
        err.code = json?.code;
        reject(err);
      }
    };
    xhr.onerror = () => {
      onProgress({ percent: 0, state: "error" });
      reject(new Error("Network error while uploading. Please try again."));
    };
    xhr.send(form);
  });
}
