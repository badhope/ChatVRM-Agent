import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileSidebar } from './MobileSidebar';
import { Header } from './Header';
import { useAppStore } from '@/app/store';
import { cn } from '@/lib/cn';

export function MainLayout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleMobileClose = useCallback(() => setMobileOpen(false), []);
  const handleMobileToggle = useCallback(() => setMobileOpen((prev) => !prev), []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      <Sidebar />
      <MobileSidebar open={mobileOpen} onClose={handleMobileClose} />
      <div className="flex flex-1 flex-col min-w-0">
        <Header onMobileMenuToggle={handleMobileToggle} />
        <main
          className="flex-1 overflow-auto transition-all duration-300"
          aria-label="Main content"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
