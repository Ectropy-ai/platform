/** @jest-environment jsdom */
/**
 * Tests for CTAButton Component
 * Validates custom Button component with enhanced styling
 */

import {
  renderWithTheme as render,
  screen,
  fireEvent,
} from '../../../test-utils/render-with-theme';
import { ThemeProvider } from '@mui/material/styles';
import { ectropyTheme } from '../../../theme/ectropy-theme';
import { CTAButton } from '../CTAButton';
import { vi } from 'vitest';

describe('CTAButton', () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={ectropyTheme}>{component}</ThemeProvider>);
  };

  describe('rendering', () => {
    it('should render without crashing', () => {
      renderWithTheme(<CTAButton>Click Me</CTAButton>);
      expect(screen.getByRole('button', { name: 'Click Me' })).toBeInTheDocument();
    });

    it('should render button text', () => {
      renderWithTheme(<CTAButton>Get Started</CTAButton>);
      expect(screen.getByText('Get Started')).toBeInTheDocument();
    });

    it('should render with children', () => {
      renderWithTheme(
        <CTAButton>
          <span data-testid='button-content'>Button Content</span>
        </CTAButton>,
      );
      expect(screen.getByTestId('button-content')).toBeInTheDocument();
    });
  });

  describe('Material-UI Button props', () => {
    it('should accept variant prop', () => {
      renderWithTheme(<CTAButton variant='contained'>Contained</CTAButton>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should accept color prop', () => {
      renderWithTheme(<CTAButton color='primary'>Primary</CTAButton>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should accept size prop', () => {
      renderWithTheme(<CTAButton size='large'>Large Button</CTAButton>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should accept disabled prop', () => {
      renderWithTheme(<CTAButton disabled>Disabled</CTAButton>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should accept fullWidth prop', () => {
      renderWithTheme(<CTAButton fullWidth>Full Width</CTAButton>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should accept startIcon prop', () => {
      renderWithTheme(
        <CTAButton startIcon={<span data-testid='start-icon'>→</span>}>With Icon</CTAButton>,
      );
      expect(screen.getByTestId('start-icon')).toBeInTheDocument();
    });

    it('should accept endIcon prop', () => {
      renderWithTheme(
        <CTAButton endIcon={<span data-testid='end-icon'>←</span>}>With Icon</CTAButton>,
      );
      expect(screen.getByTestId('end-icon')).toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    it('should call onClick handler when clicked', () => {
      const handleClick = vi.fn();
      renderWithTheme(<CTAButton onClick={handleClick}>Click Me</CTAButton>);

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', () => {
      const handleClick = vi.fn();
      renderWithTheme(
        <CTAButton disabled onClick={handleClick}>
          Disabled
        </CTAButton>,
      );

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should handle multiple clicks', () => {
      const handleClick = vi.fn();
      renderWithTheme(<CTAButton onClick={handleClick}>Multi Click</CTAButton>);

      const button = screen.getByRole('button');
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(3);
    });
  });

  describe('styling', () => {
    it('should have custom styling applied', () => {
      const { container } = renderWithTheme(<CTAButton>Styled</CTAButton>);
      const button = container.firstChild as HTMLElement;
      const styles = window.getComputedStyle(button);

      expect(styles.transition).toContain('all');
      expect(styles.fontWeight).toBe('600');
    });

    it('should accept sx prop for additional styling', () => {
      renderWithTheme(
        <CTAButton sx={{ backgroundColor: 'red' }} data-testid='custom-button'>
          Custom
        </CTAButton>,
      );
      expect(screen.getByTestId('custom-button')).toBeInTheDocument();
    });

    it('should accept className prop', () => {
      renderWithTheme(
        <CTAButton className='custom-class' data-testid='class-button'>
          With Class
        </CTAButton>,
      );
      expect(screen.getByTestId('class-button')).toHaveClass('custom-class');
    });
  });

  describe('accessibility', () => {
    it('should have accessible button role', () => {
      renderWithTheme(<CTAButton>Accessible</CTAButton>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should support aria-label', () => {
      renderWithTheme(<CTAButton aria-label='Submit form'>Submit</CTAButton>);
      expect(screen.getByRole('button', { name: 'Submit form' })).toBeInTheDocument();
    });

    it('should support aria-disabled when disabled', () => {
      renderWithTheme(<CTAButton disabled>Disabled</CTAButton>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('disabled');
    });

    it('should be keyboard accessible', () => {
      renderWithTheme(<CTAButton>Keyboard</CTAButton>);

      const button = screen.getByRole('button');
      // Button should be focusable (keyboard accessible)
      button.focus();
      expect(document.activeElement).toBe(button);
      // Button should not have negative tabIndex (which would make it not keyboard accessible)
      expect(button).not.toHaveAttribute('tabindex', '-1');
    });
  });

  describe('form integration', () => {
    it('should accept type prop for form submission', () => {
      renderWithTheme(<CTAButton type='submit'>Submit Form</CTAButton>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'submit');
    });

    it('should accept type button', () => {
      renderWithTheme(<CTAButton type='button'>Button Type</CTAButton>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'button');
    });

    it('should work in form context', () => {
      const handleSubmit = vi.fn(e => e.preventDefault());
      renderWithTheme(
        <form onSubmit={handleSubmit}>
          <CTAButton type='submit'>Submit</CTAButton>
        </form>,
      );

      fireEvent.click(screen.getByRole('button'));
      expect(handleSubmit).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty children', () => {
      renderWithTheme(<CTAButton />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should handle long text content', () => {
      const longText = 'This is a very long button text that might wrap to multiple lines';
      renderWithTheme(<CTAButton>{longText}</CTAButton>);
      expect(screen.getByText(longText)).toBeInTheDocument();
    });

    it('should handle special characters in text', () => {
      renderWithTheme(<CTAButton>{'Click & Save 50%!'}</CTAButton>);
      expect(screen.getByText('Click & Save 50%!')).toBeInTheDocument();
    });
  });

  describe('component prop spreading', () => {
    it('should spread all props to underlying Button', () => {
      renderWithTheme(
        <CTAButton data-testid='all-props' id='unique-button' name='submit-button' value='submit'>
          All Props
        </CTAButton>,
      );

      const button = screen.getByTestId('all-props');
      expect(button).toHaveAttribute('id', 'unique-button');
      expect(button).toHaveAttribute('name', 'submit-button');
      expect(button).toHaveAttribute('value', 'submit');
    });
  });
});
