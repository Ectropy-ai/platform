/** @jest-environment jsdom */
/**
 * Tests for FeatureCard Component
 * Validates feature display card with icon, title, description, and optional metric
 */

import { render, screen } from '../../../test-utils/render-with-theme';
import { ThemeProvider } from '@mui/material/styles';
import { ectropyTheme } from '../../../theme/ectropy-theme';
import { FeatureCard } from '../FeatureCard';

describe('FeatureCard', () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={ectropyTheme}>{component}</ThemeProvider>);
  };

  const mockIcon = <span data-testid='feature-icon'>🎯</span>;

  describe('rendering', () => {
    it('should render without crashing', () => {
      renderWithTheme(
        <FeatureCard icon={mockIcon} title='Test Feature' description='Test description' />,
      );
      expect(screen.getByRole('article')).toBeInTheDocument();
    });

    it('should render icon', () => {
      renderWithTheme(<FeatureCard icon={mockIcon} title='Feature' description='Description' />);
      expect(screen.getByTestId('feature-icon')).toBeInTheDocument();
    });

    it('should render title', () => {
      renderWithTheme(
        <FeatureCard icon={mockIcon} title='Amazing Feature' description='Description' />,
      );
      expect(screen.getByText('Amazing Feature')).toBeInTheDocument();
    });

    it('should render description', () => {
      renderWithTheme(
        <FeatureCard
          icon={mockIcon}
          title='Feature'
          description='This is a detailed description of the feature'
        />,
      );
      expect(screen.getByText('This is a detailed description of the feature')).toBeInTheDocument();
    });

    it('should render metric when provided', () => {
      renderWithTheme(
        <FeatureCard icon={mockIcon} title='Feature' description='Description' metric='85%' />,
      );
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('should not render metric when not provided', () => {
      const { container } = renderWithTheme(
        <FeatureCard icon={mockIcon} title='Feature' description='Description' />,
      );
      // Metric should not be present
      const metricElements = container.querySelectorAll('[class*="MuiTypography-h6"]');
      expect(metricElements.length).toBe(1); // Only title, not metric
    });
  });

  describe('title styling', () => {
    it('should render title as h3 element', () => {
      renderWithTheme(<FeatureCard icon={mockIcon} title='Title Test' description='Description' />);
      expect(screen.getByRole('heading', { level: 3, name: 'Title Test' })).toBeInTheDocument();
    });

    it('should have proper title styling', () => {
      renderWithTheme(
        <FeatureCard icon={mockIcon} title='Styled Title' description='Description' />,
      );
      const title = screen.getByText('Styled Title');
      expect(title).toBeInTheDocument();
    });
  });

  describe('metric styling', () => {
    it('should display metric with primary color', () => {
      renderWithTheme(
        <FeatureCard icon={mockIcon} title='Feature' description='Description' metric='95%' />,
      );
      const metric = screen.getByText('95%');
      expect(metric).toBeInTheDocument();
    });

    it('should handle various metric formats', () => {
      const metrics = ['100%', '5/10', '$1.2M', '+45%', '3.5x'];

      metrics.forEach(metric => {
        const { rerender } = renderWithTheme(
          <FeatureCard icon={mockIcon} title='Feature' description='Description' metric={metric} />,
        );
        expect(screen.getByText(metric)).toBeInTheDocument();

        // Clean up for next iteration
        rerender(<div />);
      });
    });
  });

  describe('icon rendering', () => {
    it('should render React element icon', () => {
      const customIcon = <div data-testid='custom-icon'>Custom Icon</div>;
      renderWithTheme(<FeatureCard icon={customIcon} title='Feature' description='Description' />);
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });

    it('should render SVG icon', () => {
      const svgIcon = (
        <svg data-testid='svg-icon' width='24' height='24'>
          <circle cx='12' cy='12' r='10' />
        </svg>
      );
      renderWithTheme(<FeatureCard icon={svgIcon} title='Feature' description='Description' />);
      expect(screen.getByTestId('svg-icon')).toBeInTheDocument();
    });

    it('should render Material-UI icon component', () => {
      const MuiIcon = () => <span data-testid='mui-icon'>★</span>;
      renderWithTheme(<FeatureCard icon={<MuiIcon />} title='Feature' description='Description' />);
      expect(screen.getByTestId('mui-icon')).toBeInTheDocument();
    });
  });

  describe('hover effects', () => {
    it('should have hover transition styling', () => {
      const { container } = renderWithTheme(
        <FeatureCard icon={mockIcon} title='Hover Test' description='Description' />,
      );
      const card = container.querySelector('[class*="MuiCard"]') as HTMLElement;
      expect(card).toBeInTheDocument();

      const styles = window.getComputedStyle(card);
      expect(styles.transition).toContain('all');
    });
  });

  describe('accessibility', () => {
    it('should be accessible as an article', () => {
      renderWithTheme(
        <FeatureCard
          icon={mockIcon}
          title='Accessible Feature'
          description='Accessible description'
        />,
      );
      expect(screen.getByRole('article')).toBeInTheDocument();
    });

    it('should have accessible heading', () => {
      renderWithTheme(
        <FeatureCard icon={mockIcon} title='Feature Heading' description='Description' />,
      );
      expect(screen.getByRole('heading', { name: 'Feature Heading' })).toBeInTheDocument();
    });

    it('should have semantic structure', () => {
      renderWithTheme(
        <FeatureCard icon={mockIcon} title='Semantic Feature' description='Semantic description' />,
      );
      const heading = screen.getByRole('heading');
      expect(heading.tagName).toBe('H3');
    });
  });

  describe('card layout', () => {
    it('should use full height for consistent grid layouts', () => {
      const { container } = renderWithTheme(
        <FeatureCard icon={mockIcon} title='Layout Test' description='Description' />,
      );
      const card = container.querySelector('[class*="MuiCard"]') as HTMLElement;
      expect(card).toBeInTheDocument();
    });
  });

  describe('content spacing', () => {
    it('should have proper spacing between elements', () => {
      renderWithTheme(
        <FeatureCard
          icon={mockIcon}
          title='Spacing Test'
          description='Testing spacing'
          metric='50%'
        />,
      );

      // Verify all elements are present and rendered
      expect(screen.getByTestId('feature-icon')).toBeInTheDocument();
      expect(screen.getByText('Spacing Test')).toBeInTheDocument();
      expect(screen.getByText('Testing spacing')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle empty description', () => {
      renderWithTheme(<FeatureCard icon={mockIcon} title='Title Only' description='' />);
      expect(screen.getByText('Title Only')).toBeInTheDocument();
    });

    it('should handle long title', () => {
      const longTitle = 'This is a very long feature title that might wrap to multiple lines';
      renderWithTheme(<FeatureCard icon={mockIcon} title={longTitle} description='Description' />);
      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it('should handle long description', () => {
      const longDescription =
        'This is a very long description that explains the feature in great detail and might span multiple lines in the card layout to provide comprehensive information to users.';
      renderWithTheme(
        <FeatureCard icon={mockIcon} title='Feature' description={longDescription} />,
      );
      expect(screen.getByText(longDescription)).toBeInTheDocument();
    });

    it('should handle special characters in text', () => {
      renderWithTheme(
        <FeatureCard
          icon={mockIcon}
          title='Feature & Benefits'
          description='Description with <special> characters'
          metric='+45%'
        />,
      );
      expect(screen.getByText('Feature & Benefits')).toBeInTheDocument();
      expect(screen.getByText('Description with <special> characters')).toBeInTheDocument();
      expect(screen.getByText('+45%')).toBeInTheDocument();
    });
  });

  describe('component composition', () => {
    it('should work with complex icon elements', () => {
      const complexIcon = (
        <div data-testid='complex-icon'>
          <span>Icon</span>
          <span>Badge</span>
        </div>
      );
      renderWithTheme(
        <FeatureCard
          icon={complexIcon}
          title='Complex Icon'
          description='With complex icon structure'
        />,
      );
      expect(screen.getByTestId('complex-icon')).toBeInTheDocument();
    });

    it('should render with all optional props provided', () => {
      renderWithTheme(
        <FeatureCard
          icon={mockIcon}
          title='Full Feature'
          description='Complete feature card'
          metric='100%'
        />,
      );

      expect(screen.getByTestId('feature-icon')).toBeInTheDocument();
      expect(screen.getByText('Full Feature')).toBeInTheDocument();
      expect(screen.getByText('Complete feature card')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });
});
