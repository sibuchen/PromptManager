import { Routes, Route } from 'react-router-dom';
import { SettingsProvider } from './contexts/SettingsContext';
import Layout from './components/Layout';
import Editor from './pages/Editor';
import Library from './pages/Library';
import Settings from './pages/Settings';

function App() {
  return (
    <SettingsProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Editor replaces generic TopToolbar in its own definition */}
          <Route index element={<Editor />} />

          <Route path="library" element={<Library />} />
          <Route path="history" element={
            <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-surface text-on-surface-variant">
              <p>Content for History / Work in Progress</p>
              <p className="text-xs font-mono text-on-surface-variant"><a href="https://github.com/sibuchen" target="_blank" rel="noopener noreferrer">Made with ❤️ by sibuchen</a></p>
            </div>
          } />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </SettingsProvider>
  );
}

export default App;
