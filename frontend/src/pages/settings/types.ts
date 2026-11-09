export type SettingsTabId =
  | "profile"
  | "appearance"
  | "models"
  | "agents"
  | "api-keys"
  | "integrations"
  | "notifications"
  | "security"
  | "privacy"
  | "support";

export interface ProfileFormData {
  name: string;
  email: string;
  avatarUrl: string;
  role: string;
  organization: string;
  timezone: string;
  bio: string;
}

export interface AppearancePreferences {
  theme: "dark" | "light" | "high-contrast";
  uiDensity: "comfortable" | "compact";
  editorFont: string;
  editorFontSize: number;
  tabSize: number;
  lineNumbers: boolean;
  minimap: boolean;
  wordWrap: boolean;
  reduceMotion: boolean;
  highContrastBorders: boolean;
  audioCues: boolean;
}

export interface ModelPreferences {
  provider: "forge" | "anthropic" | "openai_compatible";
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  fallbackToCredits: boolean;
}

export interface AgentFleetPreferences {
  autoDeploy: boolean;
  debugIterations: number;
  requireMigrationApproval: boolean;
  requirePackageApproval: boolean;
  requireScriptApproval: boolean;
  codeFlavor: "strict-ts" | "fast-scaffold" | "lean-minimal";
  testCoverageMode: "comprehensive" | "smoke-only" | "disabled";
  gitBranchPrefix: string;
  conventionalCommits: boolean;
}

export interface NotificationPreferences {
  emailBuildComplete: boolean;
  emailBuildFailed: boolean;
  emailDeploySuccess: boolean;
  emailLowCredits: boolean;
  emailSecurityAlerts: boolean;
  inAppToasts: boolean;
  audioAlerts: boolean;
  digestFrequency: "realtime" | "daily" | "weekly" | "off";
}
