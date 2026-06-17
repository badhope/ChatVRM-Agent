import { useContext, useCallback, useRef } from "react";
import { ViewerContext } from "../features/vrmViewer/viewerContext";

interface VrmViewerProps {
  /** Fired once after the WebGL canvas is set up and ready to load a VRM. */
  onReady?: () => void;
  /** Fired when the user drops a .vrm file onto the canvas. */
  onVrmFile?: (file: File) => void;
}

export default function VrmViewer({ onReady, onVrmFile }: VrmViewerProps) {
  const { viewer } = useContext(ViewerContext);
  const cleanupRef = useRef<(() => void) | null>(null);

  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      // Tear down any previous attachment (handles Strict Mode
      // mount/unmount/remount in dev, and real unmount in prod).
      cleanupRef.current?.();
      cleanupRef.current = null;

      if (!canvas) return;
      // viewer may be undefined during SSR or if context init failed.
      if (!viewer) return;

      try {
        viewer.setup(canvas);
        // VRM loading is driven by the host (index.tsx) based on the
        // active character, so we just signal readiness here.
        if (viewer.isReady) {
          onReady?.();
        }
      } catch (e) {
        // WebGL may be unavailable on some mobile devices / browsers.
        // Swallow the error so the rest of the UI (chat, settings)
        // remains usable instead of white-screening.
        console.warn("[VrmViewer] setup failed, 3D disabled:", e);
      }

      // Drag and DropでVRMを差し替え
      const onDragOver = (event: DragEvent) => {
        event.preventDefault();
      };

      const onDrop = (event: DragEvent) => {
        event.preventDefault();

        const files = event.dataTransfer?.files;
        if (!files) return;

        const file = files[0];
        if (!file) return;

        const ext = file.name.split(".").pop()?.toLowerCase();
        if (ext === "vrm") {
          // Route through the character system so the dropped model
          // is persisted to the active character, not just loaded
          // ephemerally.
          if (onVrmFile) {
            onVrmFile(file);
          } else if (viewer) {
            const url = window.URL.createObjectURL(file);
            viewer.loadVrm(url, () => URL.revokeObjectURL(url));
          }
        }
      };

      canvas.addEventListener("dragover", onDragOver);
      canvas.addEventListener("drop", onDrop);

      cleanupRef.current = () => {
        canvas.removeEventListener("dragover", onDragOver);
        canvas.removeEventListener("drop", onDrop);
      };
    },
    [viewer, onReady, onVrmFile]
  );

  return (
    <>
      <div className="aurora-bg" aria-hidden />
      {/* svh first (fallback for older browsers), dvh second (progressive
          enhancement — wins the cascade when supported, giving us the
          full dynamic viewport height on mobile). */}
      <div className="fixed top-0 left-0 w-full h-[100svh] h-[100dvh] -z-10">
        <canvas ref={canvasRef} className="h-full w-full block touch-none"></canvas>
      </div>
    </>
  );
}
