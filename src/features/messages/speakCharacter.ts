import { wait } from "@/utils/wait";
import { Viewer } from "../vrmViewer/viewer";
import { Screenplay, Talk } from "./messages";
import type { TTSSettings } from "../tts/types";
import { synthesizeSpeech } from "../tts/tts";

const createSpeakCharacter = () => {
  let lastTime = 0;
  let prevFetchPromise: Promise<unknown> = Promise.resolve();
  let prevSpeakPromise: Promise<unknown> = Promise.resolve();

  return (
    screenplay: Screenplay,
    viewer: Viewer | undefined,
    ttsSettings: TTSSettings,
    onStart?: () => void,
    onComplete?: () => void,
    onTtsError?: (error: string) => void
  ) => {
    const fetchPromise = prevFetchPromise.then(async () => {
      // Rate-limit only for Koeiromap free endpoint; other providers
      // don't need a 1 RPS cap.
      const isKoeiromap = ttsSettings.providerId === "koeiromap";
      if (isKoeiromap) {
        const now = Date.now();
        if (now - lastTime < 1000) {
          await wait(1000 - (now - lastTime));
        }
      }

      const buffer = await fetchAudio(screenplay.talk, ttsSettings).catch(
        (err) => {
          const message =
            err instanceof Error ? err.message : "Unknown TTS error";
          console.error("[TTS error]", message, ttsSettings.providerId);
          onTtsError?.(message);
          return null;
        }
      );
      lastTime = Date.now();
      return buffer;
    });

    prevFetchPromise = fetchPromise;
    prevSpeakPromise = Promise.all([fetchPromise, prevSpeakPromise]).then(
      ([audioBuffer]) => {
        onStart?.();
        if (!audioBuffer) {
          return;
        }
        return viewer?.model?.speak(audioBuffer, screenplay);
      }
    );
    // onComplete fires when the utterance is enqueued (not when
    // playback finishes — the VRM model manages playback internally).
    prevSpeakPromise.then(() => {
      onComplete?.();
    });
  };
};

export const speakCharacter = createSpeakCharacter();

async function fetchAudio(
  talk: Talk,
  ttsSettings: TTSSettings
): Promise<ArrayBuffer> {
  const result = await synthesizeSpeech(ttsSettings, {
    text: talk.message,
    voice: ttsSettings.voice,
    speakerX: talk.speakerX,
    speakerY: talk.speakerY,
    style: talk.style,
  });
  return result.audio;
}