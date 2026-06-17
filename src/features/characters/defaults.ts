import type { Character } from "./types";
import { SYSTEM_PROMPT } from "@/features/constants/systemPromptConstants";
import {
  DEFAULT_PARAM,
  PRESET_A,
  PRESET_C,
} from "@/features/constants/koeiroParam";

/**
 * Built-in characters shipped with the app. These are seeded into
 * localStorage on first run so the user has something to play with
 * immediately, and they can be customized (but not deleted) afterwards.
 *
 * Note: all built-ins currently share /AvatarSample_B.vrm because that
 * is the only VRM bundled in /public. Users add their own VRM files
 * to create visually distinct characters.
 */
export const BUILTIN_CHARACTERS: Character[] = [
  {
    id: "builtin_amy",
    name: "Amy",
    vrmSource: "/AvatarSample_B.vrm",
    systemPrompt: SYSTEM_PROMPT,
    koeiroParam: DEFAULT_PARAM,
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "builtin_kai",
    name: "Kai",
    vrmSource: "/AvatarSample_B.vrm",
    // A cooler, more reserved persona — same emotion-tag format the
    // default prompt uses, so the LLM still emits parseable tags.
    systemPrompt: `あなたは「カイ」という名前の落ち着いた性格の人物として振舞います。
感情の種類には"neutral","happy","angry","sad","relaxed"の5つがあります。
会話文の書式は以下の通りです。
[{neutral|happy|angry|sad|relaxed}]{会話文}

あなたの発言の例は以下通りです。
[neutral]よう。何か用か？
[relaxed]まあ、ゆっくりしていけばいい。
[neutral]…そうか。なら、いいけど。
[angry]勘弁してくれ。そういうのは苦手だ。
[neutral]ふむ。[happy]悪くない提案だな。

返答には最も適切な会話文を一つだけ返答してください。
敬語は使わず、短く淡々と話してください。`,
    koeiroParam: PRESET_C,
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "builtin_miu",
    name: "Miu",
    vrmSource: "/AvatarSample_B.vrm",
    systemPrompt: `あなたは「ミウ」という名前の元気で人懐っこい性格の人物として振舞います。
感情の種類には"neutral","happy","angry","sad","relaxed"の5つがあります。
会話文の書式は以下の通りです。
[{neutral|happy|angry|sad|relaxed}]{会話文}

あなたの発言の例は以下通りです。
[happy]わあ！来てくれたんだ！
[happy]ねえねえ、いっぱいお話しよ？
[sad]えー、もう行っちゃうの？
[angry]むか！それはないよー！
[neutral]ふふっ。[happy]また遊ぼうね！

返答には最も適切な会話文を一つだけ返答してください。
敬語は使わず、元気よく話してください。`,
    koeiroParam: PRESET_A,
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
];
