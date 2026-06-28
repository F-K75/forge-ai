import { useBuildStore } from './buildStore'

export const useBuildId = () => useBuildStore(state => state.buildId)
export const useBuildStatus = () => useBuildStore(state => state.status)
export const useBuildFiles = () => useBuildStore(state => state.files)
export const useBuildPrompt = () => useBuildStore(state => state.prompt)
export const useBuildAgents = () => useBuildStore(state => state.agents)
export const useBuildCreditsUsed = () => useBuildStore(state => state.creditsUsed)
export const useBuildDebugIterations = () => useBuildStore(state => state.debugIterations)
export const useBuildStreamBuffer = () => useBuildStore(state => state.streamBuffer)
export const useBuildValidation = () => useBuildStore(state => state.validation)
export const useBuildError = () => useBuildStore(state => state.error)

export const useStartBuild = () => useBuildStore(state => state.startBuild)
export const useHandleBuildEvent = () => useBuildStore(state => state.handleEvent)
export const useSetBuildId = () => useBuildStore(state => state.setBuildId)
export const useSetFiles = () => useBuildStore(state => state.setFiles)
export const useResetBuild = () => useBuildStore(state => state.reset)