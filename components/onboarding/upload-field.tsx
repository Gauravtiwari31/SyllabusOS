"use client";
// PDF dropzone or pasted text → FormData for the onboarding actions: "text"; "file" (PDF in the
// body, up to 4 MB) or, when Vercel Blob is set up, "blobUrl" + "fileName" after the PDF was
// uploaded straight from the browser to Blob (up to 20 MB); or, for PDFs over that cap,
// "pages" + "fileName": the text read on this device with PDF.js, so any size works.
// Type is checked here for fast feedback and again on the server (magic bytes / page caps).
import { useId, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { put } from "@vercel/blob/client";
import { createUploadTokenAction } from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DotLoader } from "@/components/nu";
import { cn } from "@/lib/utils";
import { checkPdfMeta, readsOnDevice, uploadLimitMb } from "./model";
import { PdfReadError, readPdfPages } from "./pdf-text";
import type { UploadKind } from "./types";

export function UploadField({
  goalId,
  kind,
  directUploads,
  label,
  pasteLabel,
  placeholder,
  maxChars,
  submitLabel,
  pending,
  pendingLabel,
  onSubmit,
}: {
  goalId: string;
  kind: UploadKind;
  directUploads: boolean;
  label: string;
  pasteLabel: string;
  placeholder: string;
  maxChars: number;
  submitLabel: string;
  pending: boolean;
  pendingLabel: string;
  onSubmit: (form: FormData) => void;
}) {
  const [mode, setMode] = useState<"pdf" | "text">("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  /** Progress of reading or uploading a PDF before the action runs; null when idle. */
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const maxMb = uploadLimitMb(directUploads);
  const busy = pending || status !== null;
  const onDevice = file !== null && readsOnDevice(file.size, directUploads);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    const problem = checkPdfMeta(f);
    setError(problem);
    setFile(problem ? null : f);
  };

  /** Page text read here with PDF.js (JSON), or null after showing an error. */
  const readOnDevice = async (f: File): Promise<string | null> => {
    setError(null);
    setStatus("Opening PDF");
    try {
      const pages = await readPdfPages(f, (page, total) => setStatus(`Reading page ${page} of ${total}`));
      if (pages.length === 0) {
        setError(`"${f.name}" has no selectable text (is it a scan?). Scans can be up to ${maxMb} MB: split it, or paste the text instead.`);
        return null;
      }
      return JSON.stringify(pages);
    } catch (err) {
      if (!(err instanceof PdfReadError)) console.error("[upload] reading the PDF failed", err);
      setError(err instanceof PdfReadError ? err.message : "Couldn't read that PDF on this device. Paste the text instead.");
      return null;
    } finally {
      setStatus(null);
    }
  };

  /** Browser → Vercel Blob with a short-lived token; returns the blob URL, or null after showing an error. */
  const uploadDirect = async (f: File): Promise<string | null> => {
    setError(null);
    setStatus("Uploading 0%");
    try {
      const t = await createUploadTokenAction(goalId, kind, f.name);
      if (!t.ok) {
        setError(t.error);
        return null;
      }
      const blob = await put(t.data.pathname, f, {
        access: t.data.access,
        token: t.data.token,
        contentType: "application/pdf",
        onUploadProgress: (e) => setStatus(`Uploading ${Math.round(e.percentage)}%`),
      });
      return blob.url;
    } catch (err) {
      console.error("[upload] direct upload failed", err);
      setError("The upload didn't finish. Check your connection and try again.");
      return null;
    } finally {
      setStatus(null);
    }
  };

  const submit = async () => {
    const form = new FormData();
    if (mode === "pdf") {
      if (!file) return setError("Choose a PDF first.");
      if (onDevice) {
        const pages = await readOnDevice(file);
        if (!pages) return;
        form.set("pages", pages);
        form.set("fileName", file.name);
      } else if (directUploads) {
        const url = await uploadDirect(file);
        if (!url) return;
        form.set("blobUrl", url);
        form.set("fileName", file.name);
      } else {
        form.set("file", file);
      }
    } else {
      if (!text.trim()) return setError("Paste some text first.");
      form.set("text", text);
    }
    setError(null);
    onSubmit(form);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex self-start rounded-full border border-border p-0.5" role="group" aria-label="Input type">
        {(
          [
            ["pdf", "Upload PDF"],
            ["text", pasteLabel],
          ] as const
        ).map(([key, lbl]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            disabled={busy}
            onClick={() => {
              setMode(key);
              setError(null);
            }}
            className={cn(
              "h-8 rounded-full px-3 text-xs font-medium pointer-coarse:h-10",
              mode === key ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {lbl}
          </button>
        ))}
      </div>

      {mode === "pdf" ? (
        file ? (
          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(1)} MB{onDevice && " · large file: its text is read on this device"}
              </p>
            </div>
            <Button type="button" size="icon" variant="ghost" aria-label="Remove file" onClick={() => setFile(null)} disabled={busy}>
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <label
            htmlFor={id}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
              drag ? "border-foreground bg-accent" : "border-border hover:bg-muted/50",
            )}
          >
            <Upload className="size-5 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">
              PDF of any size · drag it here or tap to choose
            </span>
            <input
              ref={inputRef}
              id={id}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </label>
        )
      ) : (
        <div className="flex flex-col gap-1">
          <Textarea
            aria-label={pasteLabel}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, maxChars))}
            placeholder={placeholder}
            rows={8}
            className="text-base md:text-sm"
          />
          <span className="self-end text-xs text-muted-foreground tabular-nums">
            {text.length.toLocaleString("en-IN")} / {maxChars.toLocaleString("en-IN")}
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-[var(--nu-accent-hover)]">
          {error}
        </p>
      )}
      <Button type="button" className="self-start" onClick={() => void submit()} disabled={busy}>
        {status !== null ? (
          <DotLoader label={status} />
        ) : pending ? (
          <DotLoader label={pendingLabel} />
        ) : (
          submitLabel
        )}
      </Button>
    </div>
  );
}
