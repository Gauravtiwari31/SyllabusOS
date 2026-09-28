"use client";
// PDF dropzone or pasted text → FormData ("file" | "text") for the onboarding actions.
// Size/type are checked here for fast feedback and again on the server (magic bytes).
import { useId, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DotLoader } from "@/components/nu";
import { cn } from "@/lib/utils";
import { checkPdfMeta, MAX_UPLOAD_MB } from "./model";

export function UploadField({
  label,
  pasteLabel,
  placeholder,
  maxChars,
  submitLabel,
  pending,
  pendingLabel,
  onSubmit,
}: {
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
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    const problem = checkPdfMeta(f);
    setError(problem);
    setFile(problem ? null : f);
  };

  const submit = () => {
    const form = new FormData();
    if (mode === "pdf") {
      if (!file) return setError("Choose a PDF first.");
      form.set("file", file);
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
              <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
            <Button type="button" size="icon" variant="ghost" aria-label="Remove file" onClick={() => setFile(null)} disabled={pending}>
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
              PDF up to {MAX_UPLOAD_MB} MB · drag it here or tap to choose
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
      <Button type="button" className="self-start" onClick={submit} disabled={pending}>
        {pending ? <DotLoader label={pendingLabel} /> : submitLabel}
      </Button>
    </div>
  );
}
