"use client";

import { useRef } from "react";

export function FilePickerButton({
  inputLabel,
  onFile,
}: {
  inputLabel: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="primary-button" onClick={() => inputRef.current?.click()}>
        Upload
      </button>
      <input
        ref={inputRef}
        type="file"
        className="ops-file-input"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label={inputLabel}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}
