import { MainLayout } from "./layouts/MainLayout";
import { AuthButton } from "./components/AuthButton";
import { RepoList } from "./components/RepoList";
import { EnvPanel } from "./components/EnvPanel";
import { ActiveProjectBadge } from "./components/ActiveProjectBadge";
import { useUiStore } from "./stores/uiStore";

function AppContent() {
  const { selectedProjectId } = useUiStore();

  return (
    <div className="content-inner">
      <h1>Workroot</h1>
      <p>Local Intelligence Platform for AI-Native Development</p>
      <ActiveProjectBadge />
      <AuthButton />
      <RepoList />
      {selectedProjectId !== null && <EnvPanel projectId={selectedProjectId} />}
    </div>
  );
}

function App() {
  return (
    <MainLayout>
      <AppContent />
    </MainLayout>
  );
}

export default App;
