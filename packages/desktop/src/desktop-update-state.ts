import { createContext, useEffect, useRef, useState } from 'react';
import type { DesktopUpdateStatusDto } from '@sud-d/contracts';

type UpdateState = {
  status: DesktopUpdateStatusDto | null;
  setStatus: (status: DesktopUpdateStatusDto) => void;
  readFailed: boolean;
};

export const DesktopUpdateContext = createContext<UpdateState | null>(null);

// Read the existing safe status bridge; this never starts a network check.
// The shell owns this lifetime so changing pages cannot stop status updates.
export function useDesktopUpdateState(): UpdateState {
  const [status, updateStatus] = useState<DesktopUpdateStatusDto | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const revision = useRef(0);
  const setStatus = (next: DesktopUpdateStatusDto): void => {
    revision.current += 1;
    updateStatus(next);
    setReadFailed(false);
  };

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async (): Promise<void> => {
      const startedAtRevision = revision.current;
      let unavailable = false;
      try {
        const result = await window.sudD.update.status();
        if (!active || startedAtRevision !== revision.current) return;
        if (result.ok) {
          updateStatus(result.value);
          setReadFailed(false);
          unavailable = result.value.phase === 'unavailable';
        } else {
          setReadFailed(true);
        }
      } catch {
        if (active && startedAtRevision === revision.current) setReadFailed(true);
      } finally {
        if (active && !unavailable) timer = setTimeout(() => void refresh(), 1000);
      }
    };
    void refresh();
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  return { status, setStatus, readFailed };
}
