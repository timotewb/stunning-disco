import React, { useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { useSnapshot } from '../context/SnapshotContext';

const TimelineSlider: React.FC = () => {
  const { snapshots, activeSnapshot, setActiveSnapshot, isPlaying, setIsPlaying, playSpeed, setPlaySpeed } =
    useSnapshot();
  const intervalRef = useRef<number | null>(null);
  const currentIndexRef = useRef(0);

  const currentIndex = snapshots.findIndex((s) => s.id === activeSnapshot?.id);
  currentIndexRef.current = currentIndex;

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = window.setInterval(() => {
        const idx = currentIndexRef.current;
        if (idx < snapshots.length - 1) {
          setActiveSnapshot(snapshots[idx + 1]);
        } else {
          setIsPlaying(false);
        }
      }, 1000 / playSpeed);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, playSpeed, snapshots, setActiveSnapshot, setIsPlaying]);

  if (snapshots.length === 0) return null;

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-3 flex items-center gap-4">
      <button
        onClick={() => currentIndex > 0 && setActiveSnapshot(snapshots[currentIndex - 1])}
        disabled={currentIndex <= 0}
        className="text-gray-500 hover:text-indigo-600 disabled:opacity-30"
      >
        <SkipBack size={16} />
      </button>

      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className="text-indigo-600 hover:text-indigo-700"
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>

      <button
        onClick={() =>
          currentIndex < snapshots.length - 1 && setActiveSnapshot(snapshots[currentIndex + 1])
        }
        disabled={currentIndex >= snapshots.length - 1}
        className="text-gray-500 hover:text-indigo-600 disabled:opacity-30"
      >
        <SkipForward size={16} />
      </button>

      <div className="flex-1">
        <input
          type="range"
          min={0}
          max={snapshots.length - 1}
          value={currentIndex >= 0 ? currentIndex : 0}
          onChange={(e) => setActiveSnapshot(snapshots[parseInt(e.target.value)])}
          className="w-full accent-indigo-600"
        />
      </div>

      <span className="text-sm text-gray-600 whitespace-nowrap min-w-[120px] text-right">
        {activeSnapshot
          ? new Date(activeSnapshot.timestamp).toLocaleString()
          : '—'}
      </span>

      <select
        value={playSpeed}
        onChange={(e) => setPlaySpeed(Number(e.target.value))}
        className="text-sm border border-gray-200 rounded px-2 py-1 text-gray-600"
      >
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={5}>5×</option>
      </select>
    </div>
  );
};

export default TimelineSlider;
