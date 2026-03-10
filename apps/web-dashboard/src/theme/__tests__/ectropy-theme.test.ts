/**
 * Tests for Ectropy Theme Configuration
 * Validates Material-UI theme customization
 */

import { ectropyTheme } from '../ectropy-theme';

describe('ectropyTheme', () => {
  describe('palette configuration', () => {
    it('should have primary color set to construction blue', () => {
      expect(ectropyTheme.palette.primary.main).toBe('#1976d2');
      expect(ectropyTheme.palette.primary.light).toBe('#42a5f5');
      expect(ectropyTheme.palette.primary.dark).toBe('#1565c0');
      expect(ectropyTheme.palette.primary.contrastText).toBe('#ffffff');
    });

    it('should have secondary color set to safety orange', () => {
      expect(ectropyTheme.palette.secondary.main).toBe('#f57c00');
      expect(ectropyTheme.palette.secondary.light).toBe('#ff9800');
      expect(ectropyTheme.palette.secondary.dark).toBe('#ef6c00');
      expect(ectropyTheme.palette.secondary.contrastText).toBe('#ffffff');
    });

    it('should have error color configured', () => {
      expect(ectropyTheme.palette.error.main).toBe('#f44336');
      expect(ectropyTheme.palette.error.contrastText).toBe('#ffffff');
    });

    it('should have warning color configured', () => {
      expect(ectropyTheme.palette.warning.main).toBe('#ff9800');
      expect(ectropyTheme.palette.warning.contrastText).toBe('#000000');
    });

    it('should have info color configured', () => {
      expect(ectropyTheme.palette.info.main).toBe('#2196f3');
      expect(ectropyTheme.palette.info.contrastText).toBe('#ffffff');
    });

    it('should have success color configured', () => {
      expect(ectropyTheme.palette.success.main).toBe('#4caf50');
      expect(ectropyTheme.palette.success.contrastText).toBe('#ffffff');
    });

    it('should have background colors configured', () => {
      expect(ectropyTheme.palette.background.default).toBe('#fafafa');
      expect(ectropyTheme.palette.background.paper).toBe('#ffffff');
    });

    it('should have grey scale configured', () => {
      expect(ectropyTheme.palette.grey[50]).toBe('#fafafa');
      expect(ectropyTheme.palette.grey[500]).toBe('#9e9e9e');
      expect(ectropyTheme.palette.grey[900]).toBe('#212121');
    });
  });

  describe('typography configuration', () => {
    it('should use Inter as primary font family', () => {
      expect(ectropyTheme.typography.fontFamily).toContain('Inter');
    });

    it('should have h1 configured with proper weight and size', () => {
      expect(ectropyTheme.typography.h1.fontWeight).toBe(700);
      expect(ectropyTheme.typography.h1.fontSize).toBe('3rem');
      expect(ectropyTheme.typography.h1.lineHeight).toBe(1.2);
    });

    it('should have h2 configured with proper weight and size', () => {
      expect(ectropyTheme.typography.h2.fontWeight).toBe(600);
      expect(ectropyTheme.typography.h2.fontSize).toBe('2.5rem');
    });

    it('should have h3 configured with proper weight and size', () => {
      expect(ectropyTheme.typography.h3.fontWeight).toBe(600);
      expect(ectropyTheme.typography.h3.fontSize).toBe('2rem');
    });

    it('should have button text not uppercased', () => {
      expect(ectropyTheme.typography.button.textTransform).toBe('none');
      expect(ectropyTheme.typography.button.fontWeight).toBe(600);
    });

    it('should have body1 configured', () => {
      expect(ectropyTheme.typography.body1.fontSize).toBe('1rem');
      expect(ectropyTheme.typography.body1.fontWeight).toBe(400);
    });

    it('should have overline configured with uppercase', () => {
      expect(ectropyTheme.typography.overline.textTransform).toBe('uppercase');
    });
  });

  describe('shape and spacing', () => {
    it('should have border radius set to 12px', () => {
      expect(ectropyTheme.shape.borderRadius).toBe(12);
    });

    it('should use 8px grid system', () => {
      expect(typeof ectropyTheme.spacing).toBe('function');
      expect(ectropyTheme.spacing(1)).toBe('8px');
    });
  });

  describe('component overrides', () => {
    it('should have Button overrides configured', () => {
      const buttonOverrides = ectropyTheme.components?.MuiButton?.styleOverrides?.root;
      expect(buttonOverrides).toBeDefined();
      expect(buttonOverrides).toHaveProperty('textTransform', 'none');
      expect(buttonOverrides).toHaveProperty('fontWeight', 600);
      expect(buttonOverrides).toHaveProperty('borderRadius', 12);
    });

    it('should have Card overrides configured', () => {
      const cardOverrides = ectropyTheme.components?.MuiCard?.styleOverrides?.root;
      expect(cardOverrides).toBeDefined();
      expect(cardOverrides).toHaveProperty('borderRadius', 12);
    });

    it('should have TextField overrides configured', () => {
      const textFieldOverrides = ectropyTheme.components?.MuiTextField?.styleOverrides?.root;
      expect(textFieldOverrides).toBeDefined();
    });

    it('should have Paper overrides configured with elevations', () => {
      const paperOverrides = ectropyTheme.components?.MuiPaper?.styleOverrides;
      expect(paperOverrides?.root).toHaveProperty('borderRadius', 12);
      expect(paperOverrides?.elevation1).toBeDefined();
      expect(paperOverrides?.elevation2).toBeDefined();
      expect(paperOverrides?.elevation3).toBeDefined();
    });

    it('should have Chip overrides configured', () => {
      const chipOverrides = ectropyTheme.components?.MuiChip?.styleOverrides?.root;
      expect(chipOverrides).toBeDefined();
      expect(chipOverrides).toHaveProperty('borderRadius', 8);
      expect(chipOverrides).toHaveProperty('fontWeight', 500);
    });

    it('should have AppBar overrides configured', () => {
      const appBarOverrides = ectropyTheme.components?.MuiAppBar?.styleOverrides?.root;
      expect(appBarOverrides).toBeDefined();
    });
  });

  describe('theme object structure', () => {
    it('should be a valid Material-UI theme object', () => {
      expect(ectropyTheme).toHaveProperty('palette');
      expect(ectropyTheme).toHaveProperty('typography');
      expect(ectropyTheme).toHaveProperty('shape');
      expect(ectropyTheme).toHaveProperty('spacing');
      expect(ectropyTheme).toHaveProperty('components');
    });

    it('should verify theme is properly exported', () => {
      // ENTERPRISE: Converted from CommonJS require() to ESM import validation
      // The top-level import already validates default export structure
      expect(ectropyTheme).toBeDefined();
      expect(typeof ectropyTheme).toBe('object');
    });
  });
});
