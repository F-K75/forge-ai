import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { motion, useReducedMotion } from "motion/react";
import { presets } from "../lib/animationPresets";
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
  const reduceMotion = useReducedMotion();

  const [project, setProject] = useState<WorkspaceProject | null>(
    LIVE_MODE ? null : PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0]
  );
  // Distinct from `project === null` (still loading) -- lets the render
  // below stop showing an infinite spinner when project creation/fetch
  // fails, instead of silently spinning forever past a missed toast.
  const [loadError, setLoadError] = useState<string | null>(null);

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
          if (!cancelled) {
            toast.error("Failed to create project");
            setLoadError("Failed to create project");
          }
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
          const { build_id } = await buildsApi.create({ project_id: project.id, prompt, interactive: true });
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
  // making the presenter retype it here. In live mode, `project` loads
  // asynchronously (see the fetch effect above) and is still null on the
  // first render, so this must wait for it -- firing unconditionally on
  // mount raced handleSubmit's `if (!project) return` and silently dropped
  // the auto-submit before the project ever loaded (PROD-041).
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (autoSubmitted.current || (LIVE_MODE && !project)) return;
    const incomingPrompt = (location.state as { prompt?: string } | null)?.prompt;
    if (incomingPrompt) {
      autoSubmitted.current = true;
      handleSubmit(incomingPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  if (loadError && !project) {
    return (
      <motion.div
        className="h-screen flex flex-col items-center justify-center gap-4 bg-base px-6 text-center"
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <p className="text-sm text-muted">{loadError}</p>
        <motion.button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 transition-colors"
          {...presets.button}
        >
          Retry
        </motion.button>
      </motion.div>
    );
  }

  if (!project) {
    return (
      <motion.div
        className="h-screen flex items-center justify-center bg-base"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="h-screen flex flex-col bg-base bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(232,130,60,0.08),transparent_60%)]"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <TopBar projectName={project.name} projectId={project.id} />
      <div className="flex-1 min-h-0 grid grid-cols-[340px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)_320px] gap-3 p-3">
        <ChatPanel onSubmit={handleSubmit} />
        <EditorPanel />
        <PreviewPanel />
      </div>
      <StatusBar connectionStatus={connectionStatus} />
    </motion.div>
  );
}
