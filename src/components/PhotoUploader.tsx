"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const MAX_SIDE = 1280;

/** Shrinks a photo in the browser (max 1280px, JPEG) so uploads stay small on mobile data. */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the photo."))), "image/jpeg", 0.75)
  );
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

export function PhotoUploader({
  upload,
  label = "Add a photo",
}: {
  upload: (formData: FormData) => Promise<void>;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const small = await shrink(file);
      const fd = new FormData();
      fd.set("file", small);
      start(async () => {
        try {
          await upload(fd);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload failed.");
        }
      });
    } catch {
      setError("Could not read that photo. Try another one.");
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="rounded border border-border px-4 py-2 text-sm font-medium hover:border-ink disabled:opacity-60"
      >
        {pending ? "Uploading…" : label}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
