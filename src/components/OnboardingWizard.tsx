import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/onboarding.css";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface OnboardingWizardProps {
  onComplete: () => void;
  onClose?: () => void;
}

type Step = "welcome" | "github" | "project" | "done";

export function OnboardingWizard({
  onComplete,
  onClose,
}: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [authStatus, setAuthStatus] = useState<
    "idle" | "pending" | "done" | "error"
  >("idle");
  const [projectPath, setProjectPath] = useState("");
  const [projectError, setProjectError] = useState("");

  const handleClose = useCallback(() => {
    if (onClose) onClose();
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

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
    <Dialog open>
      <DialogContent className="onboarding-card" aria-label="Onboarding">
        {onClose && (
          <button
            onClick={handleClose}
            aria-label="Close"
            className="onboarding-close-btn"
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.25rem",
              lineHeight: 1,
              padding: "4px 8px",
              borderRadius: "4px",
              color: "var(--foreground, #888)",
            }}
          >
            &times;
          </button>
        )}
        {step === "welcome" && (
          <>
            <h2 className="onboarding-title">Welcome to Workroot</h2>
            <p className="onboarding-desc">
              Local Intelligence Platform for AI-Native Development. Let's get
              you set up.
            </p>
            <Button
              className="onboarding-btn onboarding-primary"
              onClick={() => setStep("github")}
            >
              Get Started
            </Button>
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
              <Button
                className="onboarding-btn onboarding-primary"
                onClick={handleAuth}
              >
                Connect GitHub
              </Button>
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
            <Button
              variant="outline"
              className="onboarding-btn onboarding-secondary"
              onClick={() =>
                authStatus === "done" ? setStep("project") : setStep("done")
              }
            >
              {authStatus === "done" ? "Next" : "Skip"}
            </Button>
          </>
        )}

        {step === "project" && (
          <>
            <h2 className="onboarding-title">Add a Project</h2>
            <p className="onboarding-desc">
              Point to a local repository to start tracking.
            </p>
            <label htmlFor="onboarding-project-path" className="sr-only">
              Project path
            </label>
            <Input
              id="onboarding-project-path"
              className="onboarding-input font-mono"
              type="text"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="/path/to/your/project"
            />
            {projectError && <p className="onboarding-error">{projectError}</p>}
            <Button
              className="onboarding-btn onboarding-primary"
              onClick={handleAddProject}
              disabled={!projectPath.trim()}
            >
              Add Project
            </Button>
            <Button
              variant="outline"
              className="onboarding-btn onboarding-secondary"
              onClick={() => setStep("done")}
            >
              Skip
            </Button>
          </>
        )}

        {step === "done" && (
          <>
            <h2 className="onboarding-title">You're All Set</h2>
            <p className="onboarding-desc">
              Workroot is ready. You can always add more projects and configure
              settings later.
            </p>
            <Button
              className="onboarding-btn onboarding-primary"
              onClick={onComplete}
            >
              Start Using Workroot
            </Button>
          </>
        )}

        <div
          className="onboarding-steps"
          role="tablist"
          aria-label="Setup steps"
        >
          {(["welcome", "github", "project", "done"] as Step[]).map((s) => (
            <span
              key={s}
              role="tab"
              tabIndex={0}
              aria-selected={s === step}
              aria-label={`Step: ${s}`}
              className={`onboarding-dot ${s === step ? "onboarding-dot-active" : ""}`}
              onClick={() => setStep(s)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setStep(s);
                }
              }}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
