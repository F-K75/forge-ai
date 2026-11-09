import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import InitiativeMixedMediaTray from './InitiativeMixedMediaTray';
import type { PMInitiative, PMEpic, PMSprint } from '../../lib/types/api';

const mockInitiative: PMInitiative = {
  id: 'init-101',
  user_id: 'user-system',
  name: 'Autonomous Fintech Ledger',
  status: 'active',
  version: 1,
  vision: 'Distributed transaction clearing engine.',
  tech_stack: ['React', 'FastAPI', 'PostgreSQL'],
};

const mockEpics: PMEpic[] = [
  {
    id: 'epic-1',
    initiative_id: 'init-101',
    title: 'Core Accounting Contracts',
    priority: 'p0',
    story_points: 21,
    estimated_duration: '2 weeks',
  },
];

const mockSprints: PMSprint[] = [
  {
    id: 'sprint-1',
    initiative_id: 'init-101',
    sprint_number: 1,
    name: 'Sprint 1',
    status: 'active',
    start_date: '2026-03-01',
    end_date: '2026-03-14',
  },
];

describe('InitiativeMixedMediaTray', () => {
  const onOpenCopilot = vi.fn();
  const onToggleDrawer = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the compact executive bar with badge, perspective switcher and telemetry', () => {
    render(
      <InitiativeMixedMediaTray
        initiative={mockInitiative}
        epics={mockEpics}
        sprints={mockSprints}
        onOpenCopilot={onOpenCopilot}
        copilotOpen={false}
        isOverviewTab={false}
      />
    );

    expect(screen.getByText(/INTELLIGENCE HUB/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /💼 Business/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /⚙️ Tech/i })).toBeInTheDocument();
    expect(screen.getByText(/96% INVEST/i)).toBeInTheDocument();
    expect(screen.getByText(/88% Confidence/i)).toBeInTheDocument();
  });

  it('toggles perspective between Business and Technical', () => {
    render(
      <InitiativeMixedMediaTray
        initiative={mockInitiative}
        epics={mockEpics}
        sprints={mockSprints}
        onOpenCopilot={onOpenCopilot}
        copilotOpen={false}
      />
    );

    const techBtn = screen.getByRole('button', { name: /⚙️ Tech/i });
    fireEvent.click(techBtn);
    expect(localStorage.getItem('forge_pm_survey_perspective')).toBe('technical');

    const bizBtn = screen.getByRole('button', { name: /💼 Business/i });
    fireEvent.click(bizBtn);
    expect(localStorage.getItem('forge_pm_survey_perspective')).toBe('business');
  });

  it('expands inline when clicking Expand and reveals tabs', () => {
    render(
      <InitiativeMixedMediaTray
        initiative={mockInitiative}
        epics={mockEpics}
        sprints={mockSprints}
        onOpenCopilot={onOpenCopilot}
        copilotOpen={false}
        isOverviewTab={false}
      />
    );

    const expandBtn = screen.getByTitle(/Expand Intelligence Hub inline/i);
    fireEvent.click(expandBtn);

    expect(screen.getByRole('button', { name: /^Voice Standup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Architecture Mesh/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Burndown & Velocity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^INVEST Story Deck/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Risk Simulation/i })).toBeInTheDocument();
  });

  it('navigates between media tabs correctly', () => {
    render(
      <InitiativeMixedMediaTray
        initiative={mockInitiative}
        epics={mockEpics}
        sprints={mockSprints}
        onOpenCopilot={onOpenCopilot}
        copilotOpen={false}
        isOverviewTab={true}
      />
    );

    // Switch to Architecture Mesh
    fireEvent.click(screen.getByRole('button', { name: /Architecture Mesh/i }));
    expect(screen.getByText(/Service Architecture Mesh/i)).toBeInTheDocument();
    expect(screen.getByText(/Presentation Layer/i)).toBeInTheDocument();
    expect(screen.getByText(/Edge Gateway & Auth/i)).toBeInTheDocument();

    // Switch to Burndown & Velocity
    fireEvent.click(screen.getByRole('button', { name: /^Burndown & Velocity/i }));
    expect(screen.getByText(/Sprint 1 Velocity & Burndown Trajectory/i)).toBeInTheDocument();
    expect(screen.getByText(/Velocity Statistics/i)).toBeInTheDocument();

    // Switch to INVEST Story Deck
    fireEvent.click(screen.getByRole('button', { name: /^INVEST Story Deck/i }));
    expect(screen.getByText(/STORY-101/i)).toBeInTheDocument();
    expect(screen.getByText(/Acceptance Criteria \(Checkable\):/i)).toBeInTheDocument();

    // Switch to Risk Simulation
    fireEvent.click(screen.getByRole('button', { name: /^Risk Simulation/i }));
    expect(screen.getByText(/Monte Carlo Sprint Delivery Risk Simulation/i)).toBeInTheDocument();
    expect(screen.getByText(/Schema Migration/i)).toBeInTheDocument();
  });

  it('triggers onOpenCopilot from quick directives', () => {
    render(
      <InitiativeMixedMediaTray
        initiative={mockInitiative}
        epics={mockEpics}
        sprints={mockSprints}
        onOpenCopilot={onOpenCopilot}
        copilotOpen={false}
        isOverviewTab={true}
      />
    );

    const promptBtn = screen.getByText(/🎙️ Audio Standup/i);
    fireEvent.click(promptBtn);

    expect(onOpenCopilot).toHaveBeenCalledWith(
      expect.stringContaining("Summarize today's sprint standup")
    );
  });

  it('opens slide-over drawer when drawer button is clicked', () => {
    render(
      <InitiativeMixedMediaTray
        initiative={mockInitiative}
        epics={mockEpics}
        sprints={mockSprints}
        onOpenCopilot={onOpenCopilot}
        copilotOpen={false}
        drawerOpen={false}
        onToggleDrawer={onToggleDrawer}
      />
    );

    const drawerBtn = screen.getByRole('button', { name: /Drawer/i });
    fireEvent.click(drawerBtn);

    expect(onToggleDrawer).toHaveBeenCalledWith(true);
  });
});
