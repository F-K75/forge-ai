import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { InitiativeCopilotChat } from './InitiativeCopilotChat';
import type { PMInitiative } from '../../lib/types/api';

vi.mock('../../lib/geminiPM', async () => {
  const actual = await vi.importActual('../../lib/geminiPM');
  return {
    ...actual,
    chatWithInitiativeCopilot: vi.fn().mockResolvedValue({
      reply: 'Detailed architecture and sprint velocity response.',
      mixedMedia: {
        storyCard: {
          id: 'TEST-STORY-1',
          title: 'Implement distributed circuit breaker',
          epic: 'Core Platform',
          points: 5,
          priority: 'high',
          investScore: 99,
          acceptanceCriteria: ['Must handle timeout < 50ms'],
        },
      },
      quickReplies: ['Check Burndown', 'Export Diagram'],
    }),
  };
});

describe('InitiativeCopilotChat Redesigned Component', () => {
  const mockInitiative: PMInitiative = {
    id: 'init-test',
    user_id: 'user-test',
    version: 1,
    name: 'Cloud Observability Fabric',
    status: 'active',
    tech_stack: ['Next.js', 'Go', 'ClickHouse', 'Kafka'],
    vision: 'Ultra-low latency streaming',
    product_scope: 'Real-time agent pipelines',
  };

  const mockEpics = [
    { id: 'epic-1', initiative_id: 'init-test', title: 'Data Ingestion Pipeline', story_points: 21 },
    { id: 'epic-2', initiative_id: 'init-test', title: 'Vector Query Engine', story_points: 34 },
  ];

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders initiative header, persona picker, and active tech context', () => {
    render(
      <InitiativeCopilotChat
        initiative={mockInitiative}
        epics={mockEpics as any}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Header brand
    expect(screen.getByText(/Initiative Copilot/i)).toBeInTheDocument();
    expect(screen.getByText(/Gemini 3.8 Flash/i)).toBeInTheDocument();

    // Context strip
    expect(screen.getByText('Cloud Observability Fabric')).toBeInTheDocument();
    expect(screen.getByText('Next.js')).toBeInTheDocument();
    expect(screen.getByText('ClickHouse')).toBeInTheDocument();

    // Default persona
    expect(screen.getAllByText('Staff Systems Architect').length).toBeGreaterThanOrEqual(1);
  });

  it('renders multi-modal media filter tabs', () => {
    render(
      <InitiativeCopilotChat
        initiative={mockInitiative}
        epics={mockEpics as any}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /All Media/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /🎙️ Audio/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /📊 Charts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /🧩 Stories/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /📐 Topologies/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /💻 Contracts/i })).toBeInTheDocument();
  });

  it('allows switching reasoning personas', () => {
    render(
      <InitiativeCopilotChat
        initiative={mockInitiative}
        epics={mockEpics as any}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Open persona picker
    const personaBtn = document.getElementById('copilot-persona-toggle');
    expect(personaBtn).toBeInTheDocument();
    fireEvent.click(personaBtn!);

    // Click Agile Lead & PM persona
    const agileOption = screen.getByRole('button', { name: /Agile Lead & PM/i });
    fireEvent.click(agileOption);

    // Persona updated in button trigger
    expect(screen.getAllByText('Staff Product Manager').length).toBeGreaterThanOrEqual(1);
  });

  it('sends user message and displays assistant response', async () => {
    render(
      <InitiativeCopilotChat
        initiative={mockInitiative}
        epics={mockEpics as any}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/Ask.*about burndown/i);
    fireEvent.change(input, { target: { value: 'How is our sprint burndown tracking?' } });

    const sendBtn = document.getElementById('copilot-send-button');
    fireEvent.click(sendBtn!);

    // User message displayed
    expect(screen.getByText('How is our sprint burndown tracking?')).toBeInTheDocument();

    // Assistant response appears
    await waitFor(() => {
      expect(screen.getByText(/Detailed architecture and sprint velocity response/i)).toBeInTheDocument();
    });
  });

  it('switches layout modes between docked, floating, and expanded', () => {
    render(
      <InitiativeCopilotChat
        initiative={mockInitiative}
        epics={mockEpics as any}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const container = document.getElementById('initiative-copilot-container');
    expect(container).toHaveClass('inset-y-0'); // docked

    // Click float mode button
    const floatBtn = screen.getByTitle(/Float window/i);
    fireEvent.click(floatBtn);
    expect(container).toHaveClass('bottom-4');

    // Click expanded mode button
    const expandBtn = screen.getByTitle(/Full canvas workspace/i);
    fireEvent.click(expandBtn);
    expect(container).toHaveClass('inset-3');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <InitiativeCopilotChat
        initiative={mockInitiative}
        epics={mockEpics as any}
        isOpen={true}
        onClose={onClose}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /Close copilot/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
