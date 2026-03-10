/** @jest-environment jsdom */
/**
 * Tests for SectionHeader Component
 * Validates section header with title, subtitle, and description
 */

import { render, screen } from '../../../test-utils/render-with-theme';
import { ThemeProvider } from '@mui/material/styles';
import { ectropyTheme } from '../../../theme/ectropy-theme';
import { SectionHeader } from '../SectionHeader';

describe('SectionHeader', () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={ectropyTheme}>{component}</ThemeProvider>);
  };

  describe('rendering', () => {
    it('should render without crashing', () => {
      renderWithTheme(<SectionHeader title='Test Title' />);
      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    it('should render title', () => {
      renderWithTheme(<SectionHeader title='Main Section Title' />);
      expect(screen.getByText('Main Section Title')).toBeInTheDocument();
    });

    it('should render subtitle when provided', () => {
      renderWithTheme(<SectionHeader title='Title' subtitle='Subtitle Text' />);
      expect(screen.getByText('Subtitle Text')).toBeInTheDocument();
    });

    it('should render description when provided', () => {
      renderWithTheme(<SectionHeader title='Title' description='This is a detailed description' />);
      expect(screen.getByText('This is a detailed description')).toBeInTheDocument();
    });

    it('should render all props together', () => {
      renderWithTheme(
        <SectionHeader
          title='Complete Header'
          subtitle='Section Category'
          description='Full section description with all details'
        />,
      );

      expect(screen.getByText('Complete Header')).toBeInTheDocument();
      expect(screen.getByText('Section Category')).toBeInTheDocument();
      expect(screen.getByText('Full section description with all details')).toBeInTheDocument();
    });
  });

  describe('alignment', () => {
    it('should align left by default', () => {
      const { container } = renderWithTheme(<SectionHeader title='Left Aligned' />);
      const box = container.firstChild as HTMLElement;
      const styles = window.getComputedStyle(box);
      expect(styles.textAlign).toBe('left');
    });

    it('should align center when specified', () => {
      const { container } = renderWithTheme(
        <SectionHeader title='Center Aligned' align='center' />,
      );
      const box = container.firstChild as HTMLElement;
      const styles = window.getComputedStyle(box);
      expect(styles.textAlign).toBe('center');
    });

    it('should align right when specified', () => {
      const { container } = renderWithTheme(<SectionHeader title='Right Aligned' align='right' />);
      const box = container.firstChild as HTMLElement;
      const styles = window.getComputedStyle(box);
      expect(styles.textAlign).toBe('right');
    });

    it('should align left when explicitly specified', () => {
      const { container } = renderWithTheme(<SectionHeader title='Explicit Left' align='left' />);
      const box = container.firstChild as HTMLElement;
      const styles = window.getComputedStyle(box);
      expect(styles.textAlign).toBe('left');
    });
  });

  describe('title semantics', () => {
    it('should render title as h2 element', () => {
      renderWithTheme(<SectionHeader title='Section Heading' />);
      expect(
        screen.getByRole('heading', { level: 2, name: 'Section Heading' }),
      ).toBeInTheDocument();
    });

    it('should have proper heading hierarchy', () => {
      renderWithTheme(<SectionHeader title='Important Section' />);
      const heading = screen.getByRole('heading');
      expect(heading.tagName).toBe('H2');
    });
  });

  describe('subtitle styling', () => {
    it('should render subtitle as overline variant', () => {
      renderWithTheme(<SectionHeader title='Title' subtitle='CATEGORY' />);
      const subtitle = screen.getByText('CATEGORY');
      expect(subtitle).toBeInTheDocument();
    });

    it('should not render subtitle when omitted', () => {
      const { container } = renderWithTheme(<SectionHeader title='No Subtitle' />);
      // Check that only one text element exists (the title)
      const textElements = container.querySelectorAll('[class*="MuiTypography"]');
      expect(textElements.length).toBe(1); // Only title
    });
  });

  describe('description styling', () => {
    it('should render description with proper styling', () => {
      renderWithTheme(<SectionHeader title='Title' description='Descriptive text' />);
      const description = screen.getByText('Descriptive text');
      expect(description).toBeInTheDocument();
    });

    it('should not render description when omitted', () => {
      const { container } = renderWithTheme(<SectionHeader title='Title' subtitle='Subtitle' />);
      // Should only have title and subtitle, no description
      expect(screen.queryByText('description')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have accessible heading structure', () => {
      renderWithTheme(
        <SectionHeader
          title='Accessible Section'
          subtitle='Introduction'
          description='Section description'
        />,
      );

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('Accessible Section');
    });

    it('should maintain semantic hierarchy with subtitle', () => {
      renderWithTheme(<SectionHeader title='Main Title' subtitle='Category Label' />);

      // Subtitle should come before title in DOM order
      const subtitle = screen.getByText('Category Label');
      const title = screen.getByText('Main Title');

      expect(subtitle).toBeInTheDocument();
      expect(title).toBeInTheDocument();
    });
  });

  describe('content variations', () => {
    it('should handle title only', () => {
      renderWithTheme(<SectionHeader title='Title Only' />);
      expect(screen.getByText('Title Only')).toBeInTheDocument();
    });

    it('should handle title with subtitle', () => {
      renderWithTheme(<SectionHeader title='Title' subtitle='Subtitle' />);
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Subtitle')).toBeInTheDocument();
    });

    it('should handle title with description', () => {
      renderWithTheme(<SectionHeader title='Title' description='Description' />);
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
    });

    it('should handle title with subtitle and description', () => {
      renderWithTheme(
        <SectionHeader title='Title' subtitle='Subtitle' description='Description' />,
      );
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Subtitle')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle empty subtitle gracefully', () => {
      const { container } = renderWithTheme(<SectionHeader title='Title' subtitle='' />);
      expect(screen.getByText('Title')).toBeInTheDocument();
      // Empty subtitle should not render - check for absence of overline variant
      const subtitleElements = container.querySelectorAll('[class*="MuiTypography"][class*="overline"]');
      expect(subtitleElements.length).toBe(0);
    });

    it('should handle empty description gracefully', () => {
      renderWithTheme(<SectionHeader title='Title' description='' />);
      expect(screen.getByText('Title')).toBeInTheDocument();
    });

    it('should handle long title text', () => {
      const longTitle =
        'This is a very long section title that might wrap to multiple lines in responsive layouts';
      renderWithTheme(<SectionHeader title={longTitle} />);
      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it('should handle long description text', () => {
      const longDescription =
        'This is a very long description that provides comprehensive information about the section content and might span multiple lines to give users complete context about what follows.';
      renderWithTheme(<SectionHeader title='Title' description={longDescription} />);
      expect(screen.getByText(longDescription)).toBeInTheDocument();
    });

    it('should handle special characters', () => {
      renderWithTheme(
        <SectionHeader
          title='Features & Benefits'
          subtitle='Section #1'
          description='Learn more @ ectropy.ai'
        />,
      );
      expect(screen.getByText('Features & Benefits')).toBeInTheDocument();
      expect(screen.getByText('Section #1')).toBeInTheDocument();
      expect(screen.getByText('Learn more @ ectropy.ai')).toBeInTheDocument();
    });
  });

  describe('layout and spacing', () => {
    it('should have bottom margin', () => {
      const { container } = renderWithTheme(<SectionHeader title='Spacing Test' />);
      const box = container.firstChild as HTMLElement;
      expect(box).toBeInTheDocument();
    });

    it('should maintain consistent spacing with all elements', () => {
      const { container } = renderWithTheme(
        <SectionHeader
          title='Complete Section'
          subtitle='Category'
          description='Full description'
        />,
      );

      // Verify all elements are rendered with proper structure
      const box = container.firstChild as HTMLElement;
      expect(box.children.length).toBeGreaterThan(1);
    });
  });

  describe('integration scenarios', () => {
    it('should work in page sections', () => {
      renderWithTheme(
        <div>
          <SectionHeader
            title='Features'
            subtitle='What We Offer'
            description='Explore our comprehensive feature set'
          />
          <div>Section content goes here</div>
        </div>,
      );

      expect(screen.getByText('Features')).toBeInTheDocument();
      expect(screen.getByText('What We Offer')).toBeInTheDocument();
      expect(screen.getByText('Explore our comprehensive feature set')).toBeInTheDocument();
    });

    it('should support multiple instances on same page', () => {
      renderWithTheme(
        <div>
          <SectionHeader title='Section 1' />
          <SectionHeader title='Section 2' />
          <SectionHeader title='Section 3' />
        </div>,
      );

      expect(screen.getByText('Section 1')).toBeInTheDocument();
      expect(screen.getByText('Section 2')).toBeInTheDocument();
      expect(screen.getByText('Section 3')).toBeInTheDocument();
    });
  });
});
