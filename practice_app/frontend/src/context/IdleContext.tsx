import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'wheel',
];

interface IdleContextValue {
  isLocked: boolean;
  unlock: () => void;
}

const IdleContext = createContext<IdleContextValue>({
  isLocked: false,
  unlock: () => {},
});

export const IdleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLocked, setIsLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => setIsLocked(true), []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(lock, IDLE_TIMEOUT_MS);
  }, [lock]);

  const unlock = useCallback(() => {
    setIsLocked(false);
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    // Don't register activity listeners when locked — mouse movement on the
    // lock screen should not reset the timer or interfere with locking.
    if (isLocked) return;

    resetTimer();

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [isLocked, resetTimer]);

  return (
    <IdleContext.Provider value={{ isLocked, unlock }}>
      {children}
    </IdleContext.Provider>
  );
};

export const useIdle = () => useContext(IdleContext);
