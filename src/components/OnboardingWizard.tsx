import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/onboarding.css";

interface OnboardingWizardProps {
  onComplete: () => void;
}

type Step = "welcome" | "github" | "project" | "done";

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [authStatus, setAuthStatus] = useState<
    "idle" | "pending" | "done" | "error"
  >("idle");
  const [projectPath, setProjectPath] = useState("");
  const [projectError, setProjectError] = useState("");

  const handleAuth = async () => {
    setAuthStatus("pending");
    try {
      const isAuthed = await invoke<boolean>("github_check_auth");
      if (isAuthed) {
        setAuthStatus("done");
        return;
      }
      const flow = await invoke<{
        verification_uri: string;
        user_code: string;
        device_code: string;
        interval: number;
      }>("github_start_device_flow");
      window.open(flow.verification_uri, "_blank");
      await invoke("github_poll_for_token", {
        deviceCode: flow.device_code,
        interval: flow.interval,
      });
      setAuthStatus("done");
    } catch {
      setAuthStatus("error");
    }
  };

  const handleAddProject = async () => {
    if (!projectPath.trim()) return;
    setProjectError("");
    try {
      await invoke("register_local_project", {
        path: projectPath.trim(),
      });
      setStep("done");
    } catch (err) {
      setProjectError(String(err));
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        {step === "welcome" && (
          <>
            <h2 className="onboarding-title">Welcome to Workroot</h2>
            <p className="onboarding-desc">
              Local Intelligence Platform for AI-Native Development. Let's get
              you set up.
            </p>
            <button
              className="onboarding-btn onboarding-primary"
              onClick={() => setStep("github")}
            >
              Get Started
            </button>
          </>
        )}

        {step === "github" && (
          <>
            <h2 className="onboarding-title">Connect GitHub</h2>
            <p className="onboarding-desc">
              Link your GitHub account to enable PR creation, CI monitoring, and
              env sharing.
            </p>
            {authStatus === "idle" && (
              <button
                className="onboarding-btn onboarding-primary"
                onClick={handleAuth}
              >
                Connect GitHub
              </button>
            )}
            {authStatus === "pending" && (
              <p className="onboarding-status">Waiting for authorization...</p>
            )}
            {authStatus === "done" && (
              <p className="onboarding-success">Connected!</p>
            )}
            {authStatus === "error" && (
              <p className="onboarding-error">
                Auth failed. You can try again later from settings.
              </p>
            )}
            <button
              className="onboarding-btn onboarding-secondary"
              onClick={() => setStep("project")}
            >
              {authStatus === "done" ? "Next" : "Skip"}
            </button>
          </>
        )}

        {step === "project" && (
          <>
            <h2 className="onboarding-title">Add a Project</h2>
            <p className="onboarding-desc">
              Point to a local repository to start tracking.
            </p>
            <input
              className="onboarding-input"
              type="text"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="/path/to/your/project"
            />
            {projectError && <p className="onboarding-error">{projectError}</p>}
            <button
              className="onboarding-btn onboarding-primary"
              onClick={handleAddProject}
              disabled={!projectPath.trim()}
            >
              Add Project
            </button>
            <button
              className="onboarding-btn onboarding-secondary"
              onClick={() => setStep("done")}
            >
              Skip
            </button>
          </>
        )}

        {step === "done" && (
          <>
            <h2 className="onboarding-title">You're All Set</h2>
            <p className="onboarding-desc">
              Workroot is ready. You can always add more projects and configure
              settings later.
            </p>
            <button
              className="onboarding-btn onboarding-primary"
              onClick={onComplete}
            >
              Start Using Workroot
            </button>
          </>
        )}

        <div className="onboarding-steps">
          {(["welcome", "github", "project", "done"] as Step[]).map((s) => (
            <span
              key={s}
              className={`onboarding-dot ${s === step ? "onboarding-dot-active" : ""}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
