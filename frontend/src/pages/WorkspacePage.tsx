import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { MessageSquare, Code2, Eye } from "lucide-react";
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

type MobilePanel = "chat" | "editor" | "preview";

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("chat");

  const [project, setProject] = useState<WorkspaceProject | null>(
    LIVE_MODE ? null : PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0]
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const creatingNewProject = useRef(false);

  useEffect(() => {
    if (!LIVE_MODE || !projectId) return;
    let cancelled = false;

    if (projectId === "new") {
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
            toast.error("Couldn't create this project. Please try again.");
            setLoadError("Couldn't create this project. Please try again.");
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
        if (!cancelled) {
          toast.error("Couldn't load this project. Please try again.");
          setProject({ id: projectId, name: "Untitled project" });
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
          const message = err?.response?.data?.detail || "Couldn't start this build. Please try again.";
          handleEvent({
            type: "build_failed",
            version: 1,
            build_id: buildId ?? "unknown",
            data: { error: message },
          });
        }
        return;
      }

      const newBuildId = `build-${Date.now().toString(36)}`;
      startBuild(newBuildId, prompt);
      setBuildId(newBuildId);
    },
    [sendMessage, startBuild, handleEvent, buildId, project]
  );

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
          className="px-4 py-2 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 active:scale-[0.98] transition-colors"
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

  const panels = [
    { key: "chat" as MobilePanel, label: "Chat", icon: MessageSquare },
    { key: "editor" as MobilePanel, label: "Code", icon: Code2 },
    { key: "preview" as MobilePanel, label: "Preview", icon: Eye },
  ];

  return (
    <motion.div
      className="h-screen flex flex-col bg-base bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(232,130,60,0.08),transparent_60%)]"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <TopBar projectName={project.name} projectId={project.id} />

      {/* Desktop: 3-column grid. Mobile/tablet: single panel with tab switcher */}
      <div className="flex-1 min-h-0">
        {/* Desktop panels */}
        <div className="hidden lg:grid grid-cols-[340px_minmax(0,1fr)_320px] gap-3 p-3 h-full">
          <ChatPanel onSubmit={handleSubmit} />
          <EditorPanel />
          <PreviewPanel />
        </div>

        {/* Tablet: 2-column with preview toggle */}
        <div className="hidden md:grid lg:hidden grid-cols-[340px_minmax(0,1fr)] gap-3 p-3 h-full">
          <ChatPanel onSubmit={handleSubmit} />
          <div className="flex flex-col gap-3">
            <EditorPanel />
            <PreviewPanel />
          </div>
        </div>

        {/* Mobile: tab-switched panels */}
        <div className="flex flex-col md:hidden h-full">
          <div className="flex-1 min-h-0 overflow-hidden">
            {mobilePanel === "chat" && <ChatPanel onSubmit={handleSubmit} />}
            {mobilePanel === "editor" && <EditorPanel />}
            {mobilePanel === "preview" && <PreviewPanel />}
          </div>
          <nav aria-label="Workspace panels" className="flex items-center justify-around border-t border-outline bg-panel px-2 py-1.5">
            {panels.map(({ key, label, icon: Icon }) => {
              const active = mobilePanel === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMobilePanel(key)}
                  aria-pressed={active}
                  aria-label={label}
                  className={[
                    "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    active ? "text-accent" : "text-muted hover:text-ink",
                  ].join(" ")}
                >
                  <Icon size={18} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <StatusBar connectionStatus={connectionStatus} />
    </motion.div>
  );
}
