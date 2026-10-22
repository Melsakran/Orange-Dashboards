"use client";

import { useCallback, useRef, useState } from "react";

export type UploadPhase<TResult> =
  | { phase: "idle" }
  | { phase: "reading"; fileName: string }
  | { phase: "failed"; fileName: string; message: string }
  | {
      phase: "review";
      fileName: string;
      result: TResult;
      saving: boolean;
      saveError: string | null;
    };

export function useFileUpload<TResult>({
  read,
  canSave,
  save,
  onSaved,
}: {
  read: (file: File) => Promise<TResult>;
  canSave: (result: TResult) => boolean;
  save: (fileName: string, result: TResult) => Promise<void>;
  onSaved: (result: TResult) => void;
}) {
  const [state, setState] = useState<UploadPhase<TResult>>({ phase: "idle" });
  const attemptRef = useRef(0);
  const close = useCallback(
    () =>
      setState((current) =>
        current.phase === "review" && current.saving ? current : { phase: "idle" },
      ),
    [],
  );

  async function chooseFile(file: File) {
    const attempt = ++attemptRef.current;
    setState({ phase: "reading", fileName: file.name });
    let next: UploadPhase<TResult>;
    try {
      const result = await read(file);
      next = { phase: "review", fileName: file.name, result, saving: false, saveError: null };
    } catch (error) {
      next = {
        phase: "failed",
        fileName: file.name,
        message: error instanceof Error ? error.message : "The file could not be read.",
      };
    }
    if (attempt !== attemptRef.current) return;
    setState((current) => (current.phase === "reading" ? next : current));
  }

  async function confirm() {
    if (state.phase !== "review" || state.saving || !canSave(state.result)) return;
    const attempt = attemptRef.current;
    const { fileName, result } = state;
    setState({ ...state, saving: true, saveError: null });
    try {
      await save(fileName, result);
      if (attempt !== attemptRef.current) return;
      setState({ phase: "idle" });
      onSaved(result);
    } catch (error) {
      if (attempt !== attemptRef.current) return;
      setState({
        phase: "review",
        fileName,
        result,
        saving: false,
        saveError: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  return { state, close, chooseFile, confirm };
}
