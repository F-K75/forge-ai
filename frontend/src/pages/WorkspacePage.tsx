import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useBuildStore } from "../store/buildStore";
import { useBuildSocket } from "../hooks/useBuildSocket";
import { runMockBuild } from "../lib/mockEmitter";
import { buildsApi, projectsApi } from "../lib/api";
import { PROJECTS } from "../lib/mockData";
import { LIVE_MODE } from "../lib/env";
import { TopBar } from "../components/build/TopBar";
import { ChatPanel } from "../components/build/ChatPanel";
import { EditorPanel } from "../components/build/EditorPanel";
import { PreviewPanel } from "../components/build/PreviewPanel";
import { StatusBar } from "../components/build/StatusBar";

interface WorkspaceProject {
  id: string;
  name: string;
}

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();

  const [project, setProject] = useState<WorkspaceProject | null>(
    LIVE_MODE ? null : PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0]
  );

  // Guards against creating a duplicate project if this effect re-runs
  // (e.g. React StrictMode's double-invoke in dev) while projectId is "new".
  const creatingNewProject = useRef(false);

  useEffect(() => {
    if (!LIVE_MODE || !projectId) return;
    let cancelled = false;

    if (projectId === "new") {
      // Arriving here (from Onboarding, or a starter chip in demo mode)
      // means no real project exists yet -- this used to fall through to
      // a fake {id: "new", ...} placeholder, and the build-creation call
      // right after it would 404 against a project that was never actually
      // created. Create the real project first (PROD-002).
      if (creatingNewProject.current) return;
      creatingNewProject.current = true;

      const incoming = location.state as { prompt?: string; template?: string } | null;
      const description = incoming?.prompt?.trim() ?? "";
      const name = description ? description.slice(0, 60) : "Untitled project";
      projectsApi
        .create({ name, description, template: incoming?.template })
        .then((p) => {
          if (!cancelled) setProject({ id: p.id, name: p.name });
        })
        .catch(() => {
          if (!cancelled) toast.error("Failed to create project");
        });
      return () => {
        cancelled = true;
      };
    }

    projectsApi
      .get(projectId)
      .then((p) => {
        if (!cancelled) setProject({ id: p.id, name: p.name });
      })
      .catch(() => {
        // Previously silent (PROD-016) -- a failed fetch (network error,
        // permissions, deleted project) rendered an "Unknown project"
        // placeholder with no indication anything had gone wrong.
        if (!cancelled) {
          toast.error("Couldn't load this project");
          setProject({ id: projectId, name: "Unknown project" });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const [buildId, setBuildId] = useState<string | null>(null);
  const startBuild = useBuildStore((s) => s.startBuild);
  const sendMessage = useBuildStore((s) => s.sendMessage);
  const handleEvent = useBuildStore((s) => s.handleEvent);

  const { connectionStatus } = useBuildSocket(LIVE_MODE ? buildId : null);

  useEffect(() => {
    if (!buildId || LIVE_MODE) return;
    // Demo driver: dispatches real, typed events through the same
    // handleEvent path the live socket uses — a drop-in for the real thing.
    const cancel = runMockBuild(buildId, handleEvent);
    return cancel;
  }, [buildId, handleEvent]);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      sendMessage({ from: "user", text: prompt });

      if (LIVE_MODE) {
        if (!project) return;
        try {
          const { build_id } = await buildsApi.create({ project_id: project.id, prompt });
          startBuild(build_id, prompt);
          setBuildId(build_id);
        } catch (err: any) {
          const message = err?.response?.data?.detail || "Failed to start build";
          handleEvent({
            type: "build_failed",
            build_id: buildId ?? "unknown",
            data: { error: message },
          });
        }
        return;
      }

      // Mock POST /builds — returns a fake buildId until a backend exists.
      const newBuildId = `build-${Date.now().toString(36)}`;
      startBuild(newBuildId, prompt);
      setBuildId(newBuildId);
    },
    [sendMessage, startBuild, handleEvent, buildId, project]
  );

  // A prompt typed on the Projects page (hero input or a starter chip)
  // arrives via router state — kick the build off immediately instead of
  // making the presenter retype it here.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    const incomingPrompt = (location.state as { prompt?: string } | null)?.prompt;
    if (incomingPrompt && !autoSubmitted.current) {
      autoSubmitted.current = true;
      handleSubmit(incomingPrompt);
    }
    // Only ever fires once per workspace mount, off the prompt handed in at nav time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!project) {
    return (
      <div className="h-screen flex items-center justify-center bg-base">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-base">
      <TopBar projectName={project.name} projectId={project.id} />
      <div className="flex-1 min-h-0 flex">
        <ChatPanel onSubmit={handleSubmit} />
        <EditorPanel />
        <PreviewPanel />
      </div>
      <StatusBar connectionStatus={connectionStatus} />
    </div>
  );
}
