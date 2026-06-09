import { useCallback, useState } from "react";
import { UploadPanel } from "./components/UploadPanel";
import { ResultPanel } from "./components/ResultPanel";
import { useAuth } from "../../auth/AuthContext";
import { supabase } from "../../storage/db";
import type { ProcessResult } from "./types";
import "./ChickenScratchApp.css";

type AppState =
  | { status: "idle" }
  | { status: "processing"; fileName: string }
  | { status: "done"; fileName: string; result: ProcessResult }
  | { status: "error"; message: string };

export function ChickenScratchApp() {
  const { state: authState } = useAuth();
  const ownerId =
    authState.status === "authenticated" ? authState.profile.id : null;
  const [appState, setAppState] = useState<AppState>({ status: "idle" });

  const handleImage = useCallback(
    async (base64: string, mimeType: string, fileName: string) => {
      setAppState({ status: "processing", fileName });
      try {
        const { data, error } = await supabase.functions.invoke(
          "process-scratch",
          { body: { image: base64, mimeType } },
        );
        if (error) throw error;
        setAppState({ status: "done", fileName, result: data as ProcessResult });
      } catch (err) {
        setAppState({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "Something went wrong — try again.",
        });
      }
    },
    [],
  );

  const handleNew = useCallback(() => setAppState({ status: "idle" }), []);

  return (
    <div className="chicken-scratch">
      {appState.status === "idle" && <UploadPanel onImage={handleImage} />}

      {appState.status === "processing" && (
        <div className="cs-processing">
          <div className="cs-spinner" aria-label="Processing" />
          <p>Processing image…</p>
        </div>
      )}

      {appState.status === "done" && (
        <ResultPanel
          result={appState.result}
          fileName={appState.fileName}
          ownerId={ownerId}
          onNew={handleNew}
        />
      )}

      {appState.status === "error" && (
        <div className="cs-error">
          <p>{appState.message}</p>
          <button onClick={handleNew}>↺ Try Again</button>
        </div>
      )}
    </div>
  );
}
