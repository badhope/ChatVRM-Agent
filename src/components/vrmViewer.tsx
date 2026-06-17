import { useContext, useCallback, useRef } from "react";
import { ViewerContext } from "../features/vrmViewer/viewerContext";
import { buildUrl } from "@/utils/buildUrl";

export default function VrmViewer() {
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
        if (viewer.isReady) {
          viewer.loadVrm(buildUrl("/AvatarSample_B.vrm"));
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
          const blob = new Blob([file], { type: "application/octet-stream" });
          const url = window.URL.createObjectURL(blob);
          viewer.loadVrm(url, () => URL.revokeObjectURL(url));
        }
      };

      canvas.addEventListener("dragover", onDragOver);
      canvas.addEventListener("drop", onDrop);

      cleanupRef.current = () => {
        canvas.removeEventListener("dragover", onDragOver);
        canvas.removeEventListener("drop", onDrop);
      };
    },
    [viewer]
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
