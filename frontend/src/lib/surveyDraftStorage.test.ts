import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveSurveyDraft,
  getLatestSurveyDraft,
  getSurveyDraftForPrompt,
  getAllSurveyDrafts,
  deleteSurveyDraft,
  clearAllSurveyDrafts,
  formatDraftTimestamp,
} from './surveyDraftStorage';

describe('surveyDraftStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and retrieves survey drafts from localStorage', () => {
    const draft = saveSurveyDraft({
      prompt: 'Build a distributed CRM platform',
      answers: {
        target_audience: 'Mid-market enterprises',
        tech_stack: 'React + Node + PostgreSQL',
      },
      additionalNotes: 'Strict SOC2 compliance required',
      domain: 'SaaS / B2B Enterprise',
    });

    expect(draft).toBeDefined();
    expect(draft!.id).toBeDefined();
    expect(draft!.prompt).toBe('Build a distributed CRM platform');
    expect(draft!.answeredCount).toBe(2);

    const retrieved = getLatestSurveyDraft();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(draft!.id);
    expect(retrieved?.answers.target_audience).toBe('Mid-market enterprises');
    expect(retrieved?.additionalNotes).toBe('Strict SOC2 compliance required');
  });

  it('finds draft by prompt match', () => {
    saveSurveyDraft({
      prompt: 'AI Healthcare Diagnostic Assistant',
      answers: {
        hipaa: 'Compliant',
      },
    });

    const found = getSurveyDraftForPrompt('ai healthcare diagnostic assistant');
    expect(found).not.toBeNull();
    expect(found?.prompt).toBe('AI Healthcare Diagnostic Assistant');

    const notFound = getSurveyDraftForPrompt('Something totally different');
    expect(notFound).toBeNull();
  });

  it('updates existing draft when id provided', () => {
    const initial = saveSurveyDraft({
      prompt: 'E-commerce platform',
      answers: { step1: 'Stripe' },
    });

    expect(initial).not.toBeNull();

    const updated = saveSurveyDraft(
      {
        prompt: 'E-commerce platform with Apple Pay',
        answers: { step1: 'Stripe', step2: 'Next.js' },
      },
      initial!.id
    );

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(initial!.id);
    expect(updated!.answeredCount).toBe(2);

    const all = getAllSurveyDrafts();
    expect(all.length).toBe(1);
    expect(all[0].prompt).toBe('E-commerce platform with Apple Pay');
  });

  it('deletes draft and clears all drafts correctly', () => {
    const draft1 = saveSurveyDraft({ prompt: 'Project 1', answers: {} });
    const draft2 = saveSurveyDraft({ prompt: 'Project 2', answers: {} });

    expect(draft1).not.toBeNull();
    expect(draft2).not.toBeNull();
    expect(getAllSurveyDrafts().length).toBe(2);

    deleteSurveyDraft(draft1!.id);
    expect(getAllSurveyDrafts().length).toBe(1);
    expect(getAllSurveyDrafts()[0].id).toBe(draft2!.id);

    clearAllSurveyDrafts();
    expect(getAllSurveyDrafts().length).toBe(0);
    expect(getLatestSurveyDraft()).toBeNull();
  });

  it('formats draft timestamps correctly', () => {
    const formatted = formatDraftTimestamp(Date.now() - 30000);
    expect(formatted).toBe('Just now');

    const formattedMinutes = formatDraftTimestamp(Date.now() - 120000);
    expect(formattedMinutes).toBe('2m ago');
  });
});
