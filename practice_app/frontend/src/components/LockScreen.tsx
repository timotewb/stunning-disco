import React from 'react';
import { useIdle } from '../context/IdleContext';

const LockScreen: React.FC = () => {
  const { isLocked, unlock } = useIdle();

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a1a]/95 backdrop-blur-sm">
      <button
        onClick={unlock}
        className="px-10 py-4 text-lg font-semibold text-white bg-[#2a2a2a] border border-white/20 rounded-xl shadow-lg hover:bg-[#3a3a3a] active:scale-95 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-white/40"
      >
        Open
      </button>
    </div>
  );
};

export default LockScreen;
