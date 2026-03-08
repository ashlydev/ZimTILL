import { useEffect, useState } from "react";
import { Button } from "./ui/Button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installStatus, setInstallStatus] = useState<"idle" | "accepted" | "dismissed">("idle");
  const [canInstall, setCanInstall] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (standalone) {
      setInstallStatus("accepted");
      return;
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setCanInstall(true);
      setNeedsReload(false);
    };

    const onInstalled = () => {
      setInstallStatus("accepted");
      setDeferredPrompt(null);
      setCanInstall(false);
    };

    const reloadKey = "zimtill_install_reload_done";

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then(() => {
        if (!navigator.serviceWorker.controller) {
          setNeedsReload(true);

          if (!sessionStorage.getItem(reloadKey)) {
            sessionStorage.setItem(reloadKey, "1");
            window.location.reload();
            return;
          }
        }
      });

      const onControllerChange = () => {
        setNeedsReload(false);
      };

      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      window.addEventListener("beforeinstallprompt", onPrompt);
      window.addEventListener("appinstalled", onInstalled);

      return () => {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
        window.removeEventListener("beforeinstallprompt", onPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setInstallStatus(choice.outcome);
    setDeferredPrompt(null);
  };

  if (needsReload && !canInstall) {
    return (
      <div className="form-stack">
        <p className="subtle-text">Preparing install support in Chrome.</p>
        <Button onClick={() => window.location.reload()} variant="secondary">
          Refresh to enable install
        </Button>
      </div>
    );
  }

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
