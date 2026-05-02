import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ githubEnabled: true, geminiEnabled: true }),
});

// Mock GoogleGenAI
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return {
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn().mockResolvedValue({ response: { text: () => 'mock summary' } }),
      }),
    };
  }),
}));

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default fetch mock
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ githubEnabled: true, geminiEnabled: true }),
    } as Response);
  });

  it('renders correctly and defaults to light theme', () => {
    const { container } = render(<App />);
    expect(screen.getByText(/RepoDoc/i)).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('id', 'repo-doc-app');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('changes theme when clicking theme buttons', async () => {
    render(<App />);

    const darkBtn = screen.getByTitle('dark');
    fireEvent.click(darkBtn);
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    const solarizedBtn = screen.getByTitle('solarized');
    fireEvent.click(solarizedBtn);
    expect(document.documentElement).toHaveAttribute('data-theme', 'solarized');

    const everforestBtn = screen.getByTitle('everforest');
    fireEvent.click(everforestBtn);
    expect(document.documentElement).toHaveAttribute('data-theme', 'everforest');
  });

  it('disables GitHub if config returns githubEnabled: false', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ githubEnabled: false, geminiEnabled: true }),
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/GitHub Disabled/i)).toBeInTheDocument();
    });

    const remoteBtn = screen.getByRole('button', { name: /remote/i });
    expect(remoteBtn).toBeDisabled();
    expect(remoteBtn).toHaveClass('grayscale');
  });

  it('shows missing Gemini key message if geminiEnabled is false', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ githubEnabled: true, geminiEnabled: false }),
    } as Response);

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getAllByText(/Gemini Key Missing/i)).toHaveLength(2);
    });
  });
});
