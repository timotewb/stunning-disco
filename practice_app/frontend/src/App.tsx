import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Team from './pages/Team';
import Matrices from './pages/Matrices';
import Timeline from './pages/Timeline';
import Requests from './pages/Requests';
import Capabilities from './pages/Capabilities';
import Settings from './pages/Settings';
import Notes from './pages/Notes';
import { SnapshotProvider } from './context/SnapshotContext';
import { IdleProvider } from './context/IdleContext';
import LockScreen from './components/LockScreen';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <SnapshotProvider>
        <IdleProvider>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="team" element={<Team />} />
              <Route path="matrices" element={<Matrices />} />
              <Route path="timeline" element={<Timeline />} />
              <Route path="requests" element={<Requests />} />
              <Route path="capabilities" element={<Capabilities />} />
              <Route path="notes" element={<Notes />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
          <LockScreen />
        </IdleProvider>
      </SnapshotProvider>
    </BrowserRouter>
  );
};

export default App;
