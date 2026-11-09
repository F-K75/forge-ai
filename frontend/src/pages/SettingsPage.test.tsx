import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from './SettingsPage';

// Mock authStore
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector?: any) => {
    const state = {
      user: {
        id: 'usr_test_123',
        email: 'alex@forge.local',
        name: 'Alex Developer',
        avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=alex',
        role: 'admin',
        credits: 2450,
        mfa_enabled: false,
      },
      fetchMe: vi.fn(),
      setUser: vi.fn(),
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

// Mock toast
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SettingsPage Redesign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders settings navigation and default profile tab', () => {
    render(
      <MemoryRouter initialEntries={['/settings#profile']}>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Profile/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /AI Models/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /API Keys/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Security/i }).length).toBeGreaterThan(0);
  });

  it('switches tabs upon clicking navigation buttons', async () => {
    render(
      <MemoryRouter initialEntries={['/settings#profile']}>
        <SettingsPage />
      </MemoryRouter>
    );

    // Switch to API Keys tab
    const apiKeysNavBtns = screen.getAllByRole('button', { name: /Developer API Keys/i });
    fireEvent.click(apiKeysNavBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Generate New Key/i)).toBeInTheDocument();
    });
  });

  it('filters navigation tabs based on search input', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    );

    const searchInputs = screen.getAllByPlaceholderText(/Quick search settings/i);
    fireEvent.change(searchInputs[0], { target: { value: 'webhook' } });

    // Integrations should remain, Appearance should be filtered out
    expect(screen.getAllByRole('button', { name: /Integrations/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Appearance/i })).not.toBeInTheDocument();
  });

  it('navigates to security tab and displays session and MFA sections', async () => {
    render(
      <MemoryRouter initialEntries={['/settings#security']}>
        <SettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Two-Factor Authentication/i)).toBeInTheDocument();
    });
  });
});
