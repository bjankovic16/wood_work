import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { createContext, useContext, useId, useLayoutEffect, useState, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { Button } from '../ui';
import './phone-three.css';

interface Chrome {
  id: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

const Context = createContext<Chrome | null>(null);
export const usePhoneThreeChrome = () => useContext(Context);

/** The project bar opens the sheet owned by the live 3D scene, without storing view state in the project. */
export function PhoneThreeChrome({ mode, children }: { mode: 'room' | 'editor' | null; children: ReactNode }) {
  const id = useId();
  const active = mode !== null;
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Reset on an actual workspace change, never on a lazy scene mount/StrictMode effect replay.
  useLayoutEffect(() => { setOpen(false); setHidden(false); }, [mode]);
  return <Context.Provider value={active ? { id, open, setOpen, hidden, setHidden } : null}>
    <div className="relative flex h-dvh select-none flex-col bg-studio-canvas text-studio-ink"
      data-phone-three={active || undefined} data-chrome-hidden={active && hidden || undefined}
      onKeyDownCapture={() => { if (hidden) setHidden(false); }}
      onClickCapture={(event) => { if (hidden && !(event.target instanceof HTMLCanvasElement)) setHidden(false); }}>
      {children}
    </div>
  </Context.Provider>;
}

export function PhoneViewButton() {
  const t = useT();
  const chrome = usePhoneThreeChrome();
  if (!chrome) return null;
  return <div role="toolbar" aria-label={t.view3d.toolbar} data-testid="three-toolbar">
    <Button variant="outline" aria-haspopup="dialog" aria-expanded={chrome.open} aria-controls={chrome.id}
      data-testid="phone-view-toggle" className="h-11 gap-1 px-2.5" onClick={() => chrome.setOpen(true)}>
      <SlidersHorizontal size={16} aria-hidden="true" />{t.topBar.view}<ChevronDown size={12} aria-hidden="true" />
    </Button>
  </div>;
}
