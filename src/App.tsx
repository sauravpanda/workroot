import { AuthButton } from "./components/AuthButton";
import { RepoList } from "./components/RepoList";

function App() {
  return (
    <main className="container">
      <h1>Workroot</h1>
      <p>Local Intelligence Platform for AI-Native Development</p>
      <AuthButton />
      <RepoList />
    </main>
  );
}

export default App;
