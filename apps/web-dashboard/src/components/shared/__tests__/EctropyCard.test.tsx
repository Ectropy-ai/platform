/** @jest-environment jsdom */
/**
 * Tests for EctropyCard Component
 * Validates custom Card component with hover effects
 */

import { render, screen } from '../../../test-utils/render-with-theme';
import { ThemeProvider } from '@mui/material/styles';
import { ectropyTheme } from '../../../theme/ectropy-theme';
import { EctropyCard } from '../EctropyCard';

describe('EctropyCard', () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={ectropyTheme}>{component}</ThemeProvider>);
  };

  describe('rendering', () => {
    it('should render without crashing', () => {
      renderWithTheme(<EctropyCard />);
      expect(screen.getByRole('article')).toBeInTheDocument();
    });

    it('should render children content', () => {
      renderWithTheme(
        <EctropyCard>
          <div data-testid='card-content'>Test Content</div>
        </EctropyCard>,
      );
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('should accept and pass through standard Card props', () => {
      renderWithTheme(
        <EctropyCard elevation={4} data-testid='ectropy-card'>
          Content
        </EctropyCard>,
      );
      const card = screen.getByTestId('ectropy-card');
      expect(card).toBeInTheDocument();
    });
  });

  describe('hover prop', () => {
    it('should render without hover effects by default', () => {
      const { container } = renderWithTheme(<EctropyCard>Content</EctropyCard>);
      const card = container.firstChild as HTMLElement;
      expect(card).toBeInTheDocument();
    });

    it('should apply hover effects when hover prop is true', () => {
      const { container } = renderWithTheme(<EctropyCard hover>Content</EctropyCard>);
      const card = container.firstChild as HTMLElement;
      expect(card).toBeInTheDocument();
    });

    it('should not apply hover effects when hover prop is false', () => {
      const { container } = renderWithTheme(<EctropyCard hover={false}>Content</EctropyCard>);
      const card = container.firstChild as HTMLElement;
      expect(card).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should have transition styling', () => {
      const { container } = renderWithTheme(<EctropyCard>Content</EctropyCard>);
      const card = container.firstChild as HTMLElement;
      const styles = window.getComputedStyle(card);
      expect(styles.transition).toContain('all');
    });
  });

  describe('Material-UI Card props', () => {
    it('should accept variant prop', () => {
      renderWithTheme(
        <EctropyCard variant='outlined' data-testid='outlined-card'>
          Content
        </EctropyCard>,
      );
      expect(screen.getByTestId('outlined-card')).toBeInTheDocument();
    });

    it('should accept sx prop for custom styling', () => {
      renderWithTheme(
        <EctropyCard sx={{ backgroundColor: 'red' }} data-testid='custom-styled-card'>
          Content
        </EctropyCard>,
      );
      expect(screen.getByTestId('custom-styled-card')).toBeInTheDocument();
    });

    it('should accept className prop', () => {
      renderWithTheme(
        <EctropyCard className='custom-class' data-testid='custom-class-card'>
          Content
        </EctropyCard>,
      );
      const card = screen.getByTestId('custom-class-card');
      expect(card).toHaveClass('custom-class');
    });
  });

  describe('accessibility', () => {
    it('should be accessible as an article element', () => {
      renderWithTheme(<EctropyCard>Accessible Content</EctropyCard>);
      const card = screen.getByRole('article');
      expect(card).toBeInTheDocument();
    });

    it('should support aria-label', () => {
      renderWithTheme(
        <EctropyCard aria-label='Feature card'>
          <div>Feature content</div>
        </EctropyCard>,
      );
      const card = screen.getByRole('article', { name: 'Feature card' });
      expect(card).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle empty children', () => {
      renderWithTheme(<EctropyCard />);
      expect(screen.getByRole('article')).toBeInTheDocument();
    });

    it('should handle multiple children', () => {
      renderWithTheme(
        <EctropyCard>
          <div data-testid='child-1'>Child 1</div>
          <div data-testid='child-2'>Child 2</div>
        </EctropyCard>,
      );
      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });

    it('should handle nested components', () => {
      renderWithTheme(
        <EctropyCard>
          <EctropyCard data-testid='nested-card'>Nested Card</EctropyCard>
        </EctropyCard>,
      );
      expect(screen.getByTestId('nested-card')).toBeInTheDocument();
    });
  });
});
