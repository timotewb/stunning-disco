import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Snapshot } from '../types';
import { getSnapshots } from '../api/client';

interface SnapshotContextValue {
  snapshots: Snapshot[];
  activeSnapshot: Snapshot | null;
  setActiveSnapshot: (s: Snapshot | null) => void;
  refresh: () => Promise<void>;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  playSpeed: number;
  setPlaySpeed: (v: number) => void;
}

export const SnapshotContext = createContext<SnapshotContextValue>({
  snapshots: [],
  activeSnapshot: null,
  setActiveSnapshot: () => {},
  refresh: async () => {},
  isPlaying: false,
  setIsPlaying: () => {},
  playSpeed: 1,
  setPlaySpeed: () => {},
});

export const SnapshotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [activeSnapshot, setActiveSnapshot] = useState<Snapshot | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);

  const refresh = useCallback(async () => {
    try {
      const data = await getSnapshots();
      setSnapshots(data);
      setActiveSnapshot((prev) => {
        if (!prev && data.length > 0) return data[data.length - 1];
        return prev;
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SnapshotContext.Provider
      value={{
        snapshots,
        activeSnapshot,
        setActiveSnapshot,
        refresh,
        isPlaying,
        setIsPlaying,
        playSpeed,
        setPlaySpeed,
      }}
    >
      {children}
    </SnapshotContext.Provider>
  );
};

export const useSnapshot = () => useContext(SnapshotContext);
