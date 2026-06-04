import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Chat } from './pages/Chat';
import { Agent } from './pages/Agent';
import { Tools } from './pages/Tools';
import { ToolTemplates } from './pages/ToolTemplates';
import { Skills } from './pages/Skills';
import { Agents } from './pages/Agents';
import { Memory } from './pages/Memory';
import { Personality } from './pages/Personality';
import { Emotion } from './pages/Emotion';
import { Config } from './pages/Config';
import { Graph } from './pages/Graph';
import { Settings } from './pages/Settings';
import { useThemeStore } from './stores/theme';
import { useEffect } from 'react';

export function App() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:sessionId" element={<Chat />} />
        <Route path="/agent" element={<Agent />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/tools/templates" element={<ToolTemplates />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/memory" element={<Memory />} />
        <Route path="/personality" element={<Personality />} />
        <Route path="/emotion" element={<Emotion />} />
        <Route path="/config" element={<Config />} />
        <Route path="/graph" element={<Graph />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
