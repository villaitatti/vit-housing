/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type SidebarContextValue = {
  collapsed: boolean;
  mobileOpen: boolean;
  isMobile: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useMediaQuery(query: string) {
  const getMatches = React.useCallback(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(query).matches;
  }, [query]);

  const [matches, setMatches] = React.useState(getMatches);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const onChange = () => setMatches(mediaQuery.matches);

    onChange();
    mediaQuery.addEventListener('change', onChange);

    return () => mediaQuery.removeEventListener('change', onChange);
  }, [getMatches, query]);

  return matches;
}

export function SidebarProvider({
  children,
  defaultCollapsed = false,
}: {
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setMobileOpen((prev) => !prev);
      return;
    }

    setCollapsed((prev) => !prev);
  }, [isMobile]);

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      collapsed,
      mobileOpen,
      isMobile,
      setCollapsed,
      setMobileOpen,
      toggleSidebar,
    }),
    [collapsed, isMobile, mobileOpen, toggleSidebar],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = React.useContext(SidebarContext);

  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }

  return context;
}

export function Sidebar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { collapsed, isMobile, mobileOpen, setMobileOpen } = useSidebar();

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/45 transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl transition-all duration-200 ease-out lg:static lg:z-auto lg:shadow-none',
          isMobile ? 'w-72' : collapsed ? 'w-20' : 'w-72',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          className,
        )}
      >
        {children}
      </aside>
    </>
  );
}

export function SidebarInset({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('flex min-h-screen min-w-0 flex-1 flex-col', className)}>{children}</div>;
}

export function SidebarHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('border-b border-sidebar-border p-4', className)}>{children}</div>;
}

export function SidebarContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('flex-1 overflow-y-auto p-3', className)}>{children}</div>;
}

export function SidebarFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('border-t border-sidebar-border p-3', className)}>{children}</div>;
}

export function SidebarTrigger({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'onClick'>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-9 w-9', className)}
      onClick={toggleSidebar}
      {...props}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  );
}
