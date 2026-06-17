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
      icon: <MenuIconSparkle />,
      onClick: () => setSection("llm"),
    },
    {
      key: "tts",
      title: t.menu.sections.tts,
      hint: t.menu.sectionHints.tts,
      icon: <MenuIconMusic />,
      onClick: () => setSection("tts"),
    },
    {
      key: "character",
      title: t.menu.sections.character,
      hint: t.menu.sectionHints.character,
      icon: <MenuIconFace />,
      onClick: () => setSection("character"),
    },
    {
      key: "chat",
      title: t.menu.sections.chat,
      hint: t.menu.sectionHints.chat,
      icon: <MenuIconChat />,
      onClick: () => setSection("chat"),
    },
    {
      key: "advanced",
      title: t.menu.sections.advanced,
      hint: t.menu.sectionHints.advanced,
      icon: <MenuIconSettings />,
      onClick: () => setSection("advanced"),
    },
  ];

  const drawerOpen = props.open;
  const handleClose = () => {
    props.onClose();
    setSection("root");
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
            onClear={props.onClearMessages}
          />
        </SectionPage>
      )}
      {section === "advanced" && (
        <SectionPage title={t.menu.back} onBack={() => setSection("root")}>
          <AdvancedSection
            onResetAll={props.onResetAll}
          />
        </SectionPage>
      )}
    </Drawer>
  );
}

function MenuIconSparkle() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z" />
    </svg>
  );
}
function MenuIconMusic() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}
function MenuIconFace() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1.2" fill="white" stroke="none" />
      <circle cx="15" cy="10" r="1.2" fill="white" stroke="none" />
      <path d="M8 15c1.5 1.5 4.5 1.5 6 0" />
    </svg>
  );
}
function MenuIconChat() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.4 7.3L3 21l1.7-6.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}
function MenuIconSettings() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
