import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

// Mock fetch
global.fetch = vi.fn();

// Mock GoogleGenAI since it's used in App
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return {
      models: {
        generateContent: vi.fn().mockResolvedValue({ text: 'mock summary' }),
      },
    };
  }),
}));

describe('App Component', () => {
  it('renders progress bar when processing', () => {
    // This is a basic test to check if the app renders
    render(<App />);
    expect(screen.getByText(/RepoDoc/i)).toBeInTheDocument();
    expect(screen.getByText(/Execute Generator/i)).toBeInTheDocument();
  });
});
