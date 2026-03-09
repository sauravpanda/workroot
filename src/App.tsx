import { MainLayout } from "./layouts/MainLayout";
import { AuthButton } from "./components/AuthButton";
import { RepoList } from "./components/RepoList";

function App() {
  return (
    <MainLayout>
      <div className="content-inner">
        <h1>Workroot</h1>
        <p>Local Intelligence Platform for AI-Native Development</p>
        <AuthButton />
        <RepoList />
      </div>
    </MainLayout>
  );
}

export default App;
