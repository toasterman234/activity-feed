export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Legacy /settings/* routes redirect into Ops → Config.
  // Keep a passthrough layout so nested redirects still work.
  return children;
}
