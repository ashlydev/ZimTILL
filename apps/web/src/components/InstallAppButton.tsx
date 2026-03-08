import { useEffect, useState } from "react";
import { Button } from "./ui/Button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installStatus, setInstallStatus] = useState<"idle" | "accepted" | "dismissed">("idle");

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const onInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setInstallStatus(choice.outcome);
    setDeferredPrompt(null);
  };

  if (!deferredPrompt && installStatus === "idle") {
    return <p className="subtle-text">Open your browser menu and tap Install app to add ZimTILL.</p>;
  }

  if (installStatus === "accepted") {
    return <p className="status-text success">ZimTILL is installed. Open it from your home screen.</p>;
  }

  if (installStatus === "dismissed") {
    return <p className="subtle-text">Install was dismissed. You can retry from the browser menu.</p>;
  }

  return (
    <Button onClick={() => void onInstall()} variant="primary">
      Install ZimTILL
    </Button>
  );
}
