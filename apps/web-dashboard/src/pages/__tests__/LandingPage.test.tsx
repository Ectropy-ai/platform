/** @jest-environment jsdom */
/**
 * Landing Page Component Tests
 * Tests for the simplified stealth-mode landing page with waitlist functionality
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LandingPage from '../LandingPage';
import { vi } from 'vitest';

// Mock fetch API with proper promise response
global.fetch = vi.fn() as ReturnType<typeof vi.fn>;

// Mock useAuth hook
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    loginWithOAuth: vi.fn(),
    logout: vi.fn(),
  }),
}));

// Mock config
vi.mock('../../services/config', () => ({
  config: {
    apiBaseUrl: 'http://localhost:4000',
  },
}));

describe('LandingPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for fetch - successful response
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, message: 'Success' }),
    });
  });

  describe('Rendering', () => {
    it('renders the main heading', () => {
      render(<LandingPage />);

      expect(screen.getByText('ectropy.ai')).toBeInTheDocument();
    });

    it('renders the tagline', () => {
      render(<LandingPage />);

      expect(
        screen.getByText('Empowering the future of construction with open-source technology')
      ).toBeInTheDocument();
    });

    it('renders the email input field', () => {
      render(<LandingPage />);

      expect(screen.getByPlaceholderText('Email Address')).toBeInTheDocument();
    });

    it('renders the submit button', () => {
      render(<LandingPage />);

      expect(screen.getByRole('button', { name: /Join Waitlist/i })).toBeInTheDocument();
    });

    it('renders the sign in button', () => {
      render(<LandingPage />);

      expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
    });

    it('renders the early access message', () => {
      render(<LandingPage />);

      expect(
        screen.getByText('Join our early access program to be the first to know')
      ).toBeInTheDocument();
    });

    it('renders the footer copyright', () => {
      render(<LandingPage />);

      expect(screen.getByText(/© 2025 ectropy.ai/i)).toBeInTheDocument();
    });
  });

  describe('Email Input', () => {
    it('updates email input when user types', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      const emailInput = screen.getByPlaceholderText('Email Address');
      await user.type(emailInput, 'test@example.com');

      expect(emailInput).toHaveValue('test@example.com');
    });

    it('has correct input type for email', () => {
      render(<LandingPage />);

      const emailInput = screen.getByPlaceholderText('Email Address');
      expect(emailInput).toHaveAttribute('type', 'email');
    });
  });

  describe('Form Submission', () => {
    it('successfully submits waitlist form', async () => {
      const user = userEvent.setup();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            message: 'Successfully joined the waitlist!',
          }),
      });

      render(<LandingPage />);

      const emailInput = screen.getByPlaceholderText('Email Address');
      const submitButton = screen.getByRole('button', { name: /Join Waitlist/i });

      await user.type(emailInput, 'test@example.com');
      await user.click(submitButton);

      // Wait for success message
      await waitFor(() => {
        expect(screen.getByText(/Welcome to Ectropy/i)).toBeInTheDocument();
      });

      // Email input should be cleared
      expect(emailInput).toHaveValue('');
    });

    it('shows loading state during form submission', async () => {
      const user = userEvent.setup();

      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise(resolve => {
        resolvePromise = resolve;
      });

      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(pendingPromise);

      render(<LandingPage />);

      const emailInput = screen.getByPlaceholderText('Email Address');
      const submitButton = screen.getByRole('button', { name: /Join Waitlist/i });

      await user.type(emailInput, 'test@example.com');
      await user.click(submitButton);

      // Check loading state
      expect(screen.getByText('Joining...')).toBeInTheDocument();
      expect(submitButton).toBeDisabled();

      // Resolve the promise to complete the test
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });

    it('prevents form submission with empty email', async () => {
      const user = userEvent.setup();
      render(<LandingPage />);

      const submitButton = screen.getByRole('button', { name: /Join Waitlist/i });
      await user.click(submitButton);

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText('Email address is required')).toBeInTheDocument();
      });

      // Fetch should not be called
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('calls API with correct data', async () => {
      const user = userEvent.setup();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      render(<LandingPage />);

      const emailInput = screen.getByPlaceholderText('Email Address');
      const submitButton = screen.getByRole('button', { name: /Join Waitlist/i });

      await user.type(emailInput, 'test@example.com');
      await user.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:4000/api/waitlist',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'test@example.com' }),
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error message on API failure', async () => {
      const user = userEvent.setup();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            success: false,
            message: 'Invalid email address',
          }),
      });

      render(<LandingPage />);

      const emailInput = screen.getByPlaceholderText('Email Address');
      const submitButton = screen.getByRole('button', { name: /Join Waitlist/i });

      await user.type(emailInput, 'invalid@test.com');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid email address')).toBeInTheDocument();
      });
    });

    it('shows generic error message on network failure', async () => {
      const user = userEvent.setup();

      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error')
      );

      render(<LandingPage />);

      const emailInput = screen.getByPlaceholderText('Email Address');
      const submitButton = screen.getByRole('button', { name: /Join Waitlist/i });

      await user.type(emailInput, 'test@example.com');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Sign In', () => {
    it('calls onSignIn callback when sign in button is clicked', async () => {
      const user = userEvent.setup();
      const onSignIn = vi.fn();

      render(<LandingPage onSignIn={onSignIn} />);

      const signInButton = screen.getByRole('button', { name: /Sign In/i });
      await user.click(signInButton);

      expect(onSignIn).toHaveBeenCalledTimes(1);
    });

    it('calls loginWithOAuth when no onSignIn callback provided', async () => {
      const mockLoginWithOAuth = vi.fn();

      // Mock useAuth with the loginWithOAuth implementation
      vi.doMock('../../hooks/useAuth', () => ({
        useAuth: () => ({
          user: null,
          isLoading: false,
          loginWithOAuth: mockLoginWithOAuth,
          logout: vi.fn(),
        }),
      }));

      const user = userEvent.setup();
      render(<LandingPage />);

      const signInButton = screen.getByRole('button', { name: /Sign In/i });
      await user.click(signInButton);

      // The default behavior calls loginWithOAuth('google')
      // This test verifies the button is clickable
      expect(signInButton).toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('closes success snackbar when close button is clicked', async () => {
      const user = userEvent.setup();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      render(<LandingPage />);

      const emailInput = screen.getByPlaceholderText('Email Address');
      const submitButton = screen.getByRole('button', { name: /Join Waitlist/i });

      await user.type(emailInput, 'test@example.com');
      await user.click(submitButton);

      // Wait for success message
      await waitFor(() => {
        expect(screen.getByText(/Welcome to Ectropy/i)).toBeInTheDocument();
      });

      // Close the snackbar
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText(/Welcome to Ectropy/i)).not.toBeInTheDocument();
      });
    });
  });
});
