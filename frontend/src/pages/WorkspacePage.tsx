import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useBuildStore } from "../store/buildStore";
import { useBuildSocket } from "../hooks/useBuildSocket";
import { runMockBuild } from "../lib/mockEmitter";
import { PROJECTS } from "../lib/mockData";
import { TopBar } from "../components/build/TopBar";
import { ChatPanel } from "../components/build/ChatPanel";
import { EditorPanel } from "../components/build/EditorPanel";
import { PreviewPanel } from "../components/build/PreviewPanel";
import { StatusBar } from "../components/build/StatusBar";

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0];

  const [buildId, setBuildId] = useState<string | null>(null);
  const startBuild = useBuildStore((s) => s.startBuild);
  const sendMessage = useBuildStore((s) => s.sendMessage);
  const handleEvent = useBuildStore((s) => s.handleEvent);

  const { connectionStatus } = useBuildSocket(buildId);

  useEffect(() => {
    if (!buildId) return;
    // Demo driver: dispatches real, typed events through the same
    // handleEvent path the live socket uses — a drop-in for the real thing.
    const cancel = runMockBuild(buildId, handleEvent);
    return cancel;
  }, [buildId, handleEvent]);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      sendMessage({ from: "user", text: prompt });
      // Mock POST /builds — returns a fake buildId until a backend exists.
      const newBuildId = `build-${Date.now().toString(36)}`;
      startBuild(newBuildId, prompt);
      setBuildId(newBuildId);
    },
    [sendMessage, startBuild]
  );

  return (
    <div className="h-screen flex flex-col bg-base">
      <TopBar projectName={project.name} />
      <div className="flex-1 min-h-0 flex">
        <ChatPanel onSubmit={handleSubmit} />
        <EditorPanel />
        <PreviewPanel />
      </div>
      <StatusBar connectionStatus={connectionStatus} />
    </div>
  );
}
