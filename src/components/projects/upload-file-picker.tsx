"use client";

import { useRef, useState } from "react";
import { Camera, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * A mobile-safe file control. iOS can fail to open a file picker when a hidden
 * input is activated indirectly through a label inside a dialog. These buttons
 * call the native control as part of the user tap, while keeping the selected
 * file in the enclosing server-action form.
 */
export function UploadFilePicker({
  accept,
  disabled = false,
  onFileChange,
  chooseLabel = "Choose file",
  cameraLabel = "Take photo",
}: {
  accept?: string;
  disabled?: boolean;
  onFileChange?: (file: File | null) => void;
  chooseLabel?: string;
  cameraLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const openNativePicker = (source: "files" | "camera") => {
    const input = inputRef.current;
    if (!input) return;

    // Clearing lets someone retake/reselect the same filename and makes the
    // visible status truthful if the native picker is cancelled.
    input.value = "";
    setFileName(null);
    onFileChange?.(null);

    if (source === "camera") {
      input.setAttribute("accept", "image/*");
      input.setAttribute("capture", "environment");
    } else {
      if (accept) input.setAttribute("accept", accept);
      else input.removeAttribute("accept");
      input.removeAttribute("capture");
    }
    input.click();
  };

  return <div className="space-y-2">
    <input
      ref={inputRef}
      required
      name="file"
      type="file"
      accept={accept}
      className="sr-only"
      onChange={(event) => {
        const file = event.target.files?.[0] ?? null;
        setFileName(file?.name ?? null);
        onFileChange?.(file);
      }}
    />
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="md" variant="secondary" disabled={disabled} onClick={() => openNativePicker("files")}>
        <FolderOpen className="size-4" />
        {chooseLabel}
      </Button>
      <Button type="button" size="md" variant="secondary" disabled={disabled} onClick={() => openNativePicker("camera")}>
        <Camera className="size-4" />
        {cameraLabel}
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">{fileName ? `Selected: ${fileName}` : "No file selected"}</p>
  </div>;
}
