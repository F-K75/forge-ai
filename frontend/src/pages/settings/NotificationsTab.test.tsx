import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

// Live mode: talk to the (mocked) backend API.
vi.mock("../../lib/env", () => ({ LIVE_MODE: true }));

const getPrefs = vi.fn();
const updatePrefs = vi.fn();
vi.mock("../../lib/api", () => ({
  authApi: { updateProfile: vi.fn() },
  emailPreferencesApi: {
    get: (...a: unknown[]) => getPrefs(...a),
    update: (...a: unknown[]) => updatePrefs(...a),
  },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("react-hot-toast", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import { NotificationsTab } from "./NotificationsTab";

const toggle = () => screen.getByLabelText(/Product tips & reminders/i) as HTMLInputElement;

describe("Settings NotificationsTab product emails toggle", () => {
  beforeEach(() => {
    getPrefs.mockReset();
    updatePrefs.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  afterEach(() => cleanup());

  it("is disabled while loading, then shows the server's setting", async () => {
    let resolve!: (v: { marketing_emails: boolean }) => void;
    getPrefs.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<NotificationsTab />);
    expect(toggle().disabled).toBe(true);

    resolve({ marketing_emails: false });
    await waitFor(() => expect(toggle().disabled).toBe(false));
    expect(toggle().checked).toBe(false);
  });

  it("saves immediately when switched off", async () => {
    getPrefs.mockResolvedValue({ marketing_emails: true });
    updatePrefs.mockResolvedValue({ marketing_emails: false });

    render(<NotificationsTab />);
    await waitFor(() => expect(toggle().disabled).toBe(false));
    fireEvent.click(toggle());

    await waitFor(() => expect(updatePrefs).toHaveBeenCalledWith({ marketing_emails: false }));
    await waitFor(() => expect(toggle().disabled).toBe(false));
    expect(toggle().checked).toBe(false);
    expect(toastSuccess).toHaveBeenCalledWith("Product emails turned off");
  });

  it("reverts the checkbox if the save fails", async () => {
    getPrefs.mockResolvedValue({ marketing_emails: true });
    updatePrefs.mockRejectedValue(new Error("network"));

    render(<NotificationsTab />);
    await waitFor(() => expect(toggle().disabled).toBe(false));
    fireEvent.click(toggle());

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    await waitFor(() => expect(toggle().disabled).toBe(false));
    expect(toggle().checked).toBe(true);
  });

  it("stays disabled and explains when the setting can't be loaded", async () => {
    getPrefs.mockRejectedValue(new Error("network"));

    render(<NotificationsTab />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Couldn't load this setting/));
    expect(toggle().disabled).toBe(true);
    expect(updatePrefs).not.toHaveBeenCalled();
  });
});
