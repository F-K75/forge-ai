import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { axe, toHaveNoViolations } from '@axe-core/react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(toHaveNoViolations);

describe('Accessibility tests', () => {
  afterEach(() => {
    cleanup();
  });

  it('App should have no accessibility violations on initial render', async () => {
    const { container } = render(<App />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('Auth page should have no accessibility violations', async () => {
    const { container } = render(<AuthPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('Build page should have no accessibility violations', async () => {
    const { container } = render(<BuildPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('Admin console should have no accessibility violations', async () => {
    const { container } = render(<AdminConsole />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});