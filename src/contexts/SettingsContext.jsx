/**
 * SettingsContext.jsx
 *
 * Global state for user preferences and workspace configuration.
 * Manages:
 *   - theme:          'light' | 'dark'   (persisted in localStorage)
 *   - language:       'en'   | 'zh'      (persisted in localStorage)
 *   - workspaceHandle: FileSystemDirectoryHandle | null  (persisted in IndexedDB via idb-keyval)
 *
 * Theme switch works by toggling the `.dark` class on <html>.
 * We rely on Tailwind's `darkMode: 'class'` strategy so every component
 * re-renders automatically when the class flips.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { restoreWorkspace, clearWorkspace, pickWorkspace } from '../utils/fileSystem'

// ─── Context Creation ────────────────────────────────────────────────────────

const SettingsContext = createContext(null)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

function readLocalStorage(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // quota exceeded or private browsing – silently ignore
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function SettingsProvider({ children }) {
  // ── Theme ──────────────────────────────────────────────────────────────────
  const [theme, setThemeState] = useState(() => {
    const saved = readLocalStorage('pm:theme', null)
    // If user has never set a preference, respect the OS preference
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  // Sync <html> class whenever theme changes
  useEffect(() => {
    applyTheme(theme)
    writeLocalStorage('pm:theme', theme)
  }, [theme])

  const setTheme = useCallback((next) => {
    if (next !== 'light' && next !== 'dark') return
    setThemeState(next)
  }, [])

  // ── Language ───────────────────────────────────────────────────────────────
  const [language, setLanguageState] = useState(() =>
    readLocalStorage('pm:language', 'en')
  )

  const setLanguage = useCallback((next) => {
    if (next !== 'en' && next !== 'zh') return
    setLanguageState(next)
    writeLocalStorage('pm:language', next)
  }, [])

  // ── Workspace Handle ───────────────────────────────────────────────────────
  const [workspaceHandle, setWorkspaceHandle] = useState(null)
  const [workspaceRestored, setWorkspaceRestored] = useState(false)

  // On mount, try to silently restore the previously granted handle
  useEffect(() => {
    restoreWorkspace().then((handle) => {
      setWorkspaceHandle(handle)
      setWorkspaceRestored(true)
    })
  }, [])

  /** Open the native folder picker and persist the chosen handle. */
  const chooseWorkspace = useCallback(async () => {
    const handle = await pickWorkspace()
    if (handle) setWorkspaceHandle(handle)
    return handle
  }, [])

  /** Clear the persisted handle (Reset Default). */
  const resetWorkspace = useCallback(async () => {
    await clearWorkspace()
    setWorkspaceHandle(null)
  }, [])

  // ── Context Value ──────────────────────────────────────────────────────────
  const value = {
    // Theme
    theme,
    setTheme,
    isDark: theme === 'dark',

    // Language
    language,
    setLanguage,

    // Workspace
    workspaceHandle,
    workspaceRestored, // true once the async restore attempt has finished
    chooseWorkspace,
    resetWorkspace,
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Access the settings context from any child component.
 * Must be used inside <SettingsProvider>.
 */
export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used within a <SettingsProvider>')
  }
  return ctx
}

export default SettingsContext
