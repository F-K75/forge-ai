/**
 * Composite catalog components owned by WS-D (ExecutionTimeline is WS-B's and
 * is registered by src/os/genui itself). Names match the "composite"-tier
 * entries of forge-ember.catalog.json; WS-B's `registerComposite` rejects any
 * other name.
 */
export const WS_D_COMPOSITES = [
  "LivePreview",
  "DeployPanel",
  "WorkflowCanvas",
  "AgentConfigForm",
  "ProjectGrid",
  "CapabilityLauncher",
] as const
export type WsDCompositeName = (typeof WS_D_COMPOSITES)[number]
