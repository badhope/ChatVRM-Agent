import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '../components/layout/MainLayout';
import { Spinner } from '../components/ui/Spinner';

const PageLoader = () => (
  <div className="flex h-full items-center justify-center">
    <Spinner size="lg" />
  </div>
);

const ChatPage = lazy(() => import('../pages/ChatPage'));
const AgentPage = lazy(() => import('../pages/AgentPage'));
const ReviewPage = lazy(() => import('../pages/ReviewPage'));
const MemoryPage = lazy(() => import('../pages/MemoryPage'));
const ToolsPage = lazy(() => import('../pages/ToolsPage'));
const GitPage = lazy(() => import('../pages/GitPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const ExplorePage = lazy(() => import('../pages/ExplorePage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

function withSuspense(Component: React.LazyExoticComponent<() => JSX.Element>) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: 'chat', element: withSuspense(ChatPage) },
      { path: 'agent', element: withSuspense(AgentPage) },
      { path: 'review', element: withSuspense(ReviewPage) },
      { path: 'memory', element: withSuspense(MemoryPage) },
      { path: 'tools', element: withSuspense(ToolsPage) },
      { path: 'git', element: withSuspense(GitPage) },
      { path: 'settings', element: withSuspense(SettingsPage) },
      { path: 'explore', element: withSuspense(ExplorePage) },
      { path: '*', element: withSuspense(NotFoundPage) },
    ],
  },
]);
