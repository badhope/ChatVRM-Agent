import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/features/i18n/i18nContext";
import { Drawer, SectionList, SectionPage } from "./drawer";
import { LLMSection } from "./llmSection";
import { TTSSection } from "./ttsSection";
import { CharacterSection } from "./characterSection";
import { ChatSection } from "./chatSection";
import { AdvancedSection } from "./advancedSection";
import type { LLMSettings } from "@/features/llm/types";
import type { TTSSettings } from "@/features/tts/types";
import type { Message } from "@/features/messages/messages";
import type { KoeiroParam } from "@/features/constants/koeiroParam";

type SectionKey = "root" | "llm" | "tts" | "character" | "chat" | "advanced";

interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
  initialSection?: SectionKey;
  llmSettings: LLMSettings;
  onChangeLlm: (s: LLMSettings) => void;
  ttsSettings: TTSSettings;
  onChangeTts: (s: TTSSettings) => void;
  systemPrompt: string;
  onChangeSystemPrompt: (s: string) => void;
  koeiroParam: KoeiroParam;
  onChangeKoeiro: (p: KoeiroParam) => void;
  messages: Message[];
  onClearMessages: () => void;
  onPickVrm: (file: File) => void;
  onResetVrm: () => void;
  onResetAll: () => void;
  showVoicePos: boolean;
}

export function AppDrawer(props: AppDrawerProps) {
  const { t } = useI18n();
  const [section, setSection] = useState<SectionKey>(props.initialSection ?? "root");

  // When the drawer transitions from closed → open, reset to the requested section.
  useEffect(() => {
    if (props.open) {
      setSection(props.initialSection ?? "root");
    }
  }, [props.open, props.initialSection]);

  const items: Array<{ key: SectionKey; title: string; hint: string; icon: ReactNode; onClick: () => void }> = [
    {
      key: "llm",
      title: t.menu.sections.llm,
      hint: t.menu.sectionHints.llm,
      icon: <GradientIcon>✦</GradientIcon>,
      onClick: () => setSection("llm"),
    },
    {
      key: "tts",
      title: t.menu.sections.tts,
      hint: t.menu.sectionHints.tts,
      icon: <GradientIcon>♪</GradientIcon>,
      onClick: () => setSection("tts"),
    },
    {
      key: "character",
      title: t.menu.sections.character,
      hint: t.menu.sectionHints.character,
      icon: <GradientIcon>◉</GradientIcon>,
      onClick: () => setSection("character"),
    },
    {
      key: "chat",
      title: t.menu.sections.chat,
      hint: t.menu.sectionHints.chat,
      icon: <GradientIcon>☰</GradientIcon>,
      onClick: () => setSection("chat"),
    },
    {
      key: "advanced",
      title: t.menu.sections.advanced,
      hint: t.menu.sectionHints.advanced,
      icon: <GradientIcon>⚙</GradientIcon>,
      onClick: () => setSection("advanced"),
    },
  ];

  const drawerOpen = props.open;
  const handleClose = () => {
    props.onClose();
    setTimeout(() => setSection("root"), 300);
  };

  return (
    <Drawer open={drawerOpen} onClose={handleClose} title={section === "root" ? t.menu.title : ""}>
      {section === "root" && <SectionList items={items} />}
      {section === "llm" && (
        <SectionPage title={t.menu.back} onBack={() => setSection("root")}>
          <LLMSection
            settings={props.llmSettings}
            onChange={props.onChangeLlm}
            onBack={() => setSection("root")}
          />
        </SectionPage>
      )}
      {section === "tts" && (
        <SectionPage title={t.menu.back} onBack={() => setSection("root")}>
          <TTSSection
            settings={props.ttsSettings}
            onChange={props.onChangeTts}
            onBack={() => setSection("root")}
          />
        </SectionPage>
      )}
      {section === "character" && (
        <SectionPage title={t.menu.back} onBack={() => setSection("root")}>
          <CharacterSection
            systemPrompt={props.systemPrompt}
            onChangePrompt={props.onChangeSystemPrompt}
            koeiroParam={props.koeiroParam}
            onChangeKoeiro={props.onChangeKoeiro}
            onBack={() => setSection("root")}
            onPickVrm={props.onPickVrm}
            onResetVrm={props.onResetVrm}
            showVoicePos={props.showVoicePos}
          />
        </SectionPage>
      )}
      {section === "chat" && (
        <SectionPage title={t.menu.back} onBack={() => setSection("root")}>
          <ChatSection
            messages={props.messages}
            onBack={() => setSection("root")}
            onClear={props.onClearMessages}
          />
        </SectionPage>
      )}
      {section === "advanced" && (
        <SectionPage title={t.menu.back} onBack={() => setSection("root")}>
          <AdvancedSection
            onBack={() => setSection("root")}
            onResetAll={props.onResetAll}
          />
        </SectionPage>
      )}
    </Drawer>
  );
}

function GradientIcon({ children }: { children: ReactNode }) {
  return (
    <span
      className="text-base font-bold icon-gradient"
      style={{ filter: "drop-shadow(0 0 6px rgba(167,139,250,0.3))" }}
    >
      {children}
    </span>
  );
}
