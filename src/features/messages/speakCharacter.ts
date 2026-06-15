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
    viewer: Viewer,
    ttsSettings: TTSSettings,
    onStart?: () => void,
    onComplete?: () => void
  ) => {
    const fetchPromise = prevFetchPromise.then(async () => {
      const now = Date.now();
      if (now - lastTime < 1000) {
        await wait(1000 - (now - lastTime));
      }

      const buffer = await fetchAudio(screenplay.talk, ttsSettings).catch(
        () => null
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
        return viewer.model?.speak(audioBuffer, screenplay);
      }
    );
    prevSpeakPromise.then(() => {
      onComplete?.();
    });
  };
};

export const speakCharacter = createSpeakCharacter();

export const fetchAudio = async (
  talk: Talk,
  ttsSettings: TTSSettings
): Promise<ArrayBuffer> => {
  const result = await synthesizeSpeech(ttsSettings, {
    text: talk.message,
    voice: ttsSettings.voice,
    speakerX: talk.speakerX,
    speakerY: talk.speakerY,
    style: talk.style,
  });
  return result.audio;
};
