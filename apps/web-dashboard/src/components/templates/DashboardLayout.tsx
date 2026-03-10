/**
 * DashboardLayout Template Component
 *
 * Reusable dashboard layout template with sidebar, header, and content area.
 * Explicitly uses design tokens from apps/web-dashboard/src/theme/tokens.ts
 *
 * Part of Phase 3: Theme Page Templates
 */

import React, { ReactNode, useState } from 'react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Divider,
  useMediaQuery,
  useTheme,
  Avatar,
  Menu,
  MenuItem,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { colors, spacing, typography, shadows, transitions, zIndex, components } from '../../theme';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface NavigationItem {
  id: string;
  label: string;
  icon?: ReactNode;
  path: string;
  onClick?: () => void;
}

export interface DashboardLayoutProps {
  /** Main content area */
  children: ReactNode;
  /** Dashboard title */
  title?: string;
  /** Navigation items for sidebar */
  navigationItems?: NavigationItem[];
  /** Currently active navigation item ID */
  activeNavItem?: string;
  /** User profile information */
  user?: {
    name: string;
    email?: string;
    avatar?: string;
  };
  /** User menu items */
  userMenuItems?: Array<{
    label: string;
    onClick: () => void;
  }>;
  /** Header actions (e.g., notifications, search) */
  headerActions?: ReactNode;
  /** Whether to show the sidebar by default on desktop */
  sidebarOpen?: boolean;
  /** Callback when sidebar open state changes */
  onSidebarToggle?: (open: boolean) => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const StyledAppBar = styled(AppBar)({
  backgroundColor: colors.background.paper,
  color: colors.grey[900],
  boxShadow: shadows.sm,
  zIndex: zIndex.sticky,
  height: components.appBar.height,
  transition: transitions.default,

  '@media (max-width: 600px)': {
    height: components.appBar.heightMobile,
  },
});

const StyledDrawer = styled(Drawer)({
  width: components.drawer.width,
  flexShrink: 0,

  '& .MuiDrawer-paper': {
    width: components.drawer.width,
    boxSizing: 'border-box',
    backgroundColor: colors.background.paper,
    borderRight: `1px solid ${colors.grey[200]}`,
    paddingTop: spacing.md,

    '@media (max-width: 960px)': {
      width: components.drawer.widthMobile,
    },
  },
});

const ContentArea = styled(Box)<{ sidebarwidth: number }>(({ sidebarwidth }) => ({
  flexGrow: 1,
  padding: spacing['2xl'],
  marginTop: components.appBar.height,
  marginLeft: 0,
  transition: transitions.default,
  minHeight: `calc(100vh - ${components.appBar.height}px)`,
  backgroundColor: colors.background.default,

  '@media (min-width: 961px)': {
    marginLeft: sidebarwidth,
  },

  '@media (max-width: 960px)': {
    padding: spacing.lg,
    marginTop: components.appBar.heightMobile,
  },

  '@media (max-width: 600px)': {
    padding: spacing.md,
  },
}));

const LogoSection = styled(Box)({
  padding: `${spacing.md}px ${spacing.lg}px`,
  marginBottom: spacing.md,
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
});

const LogoText = styled(Typography)({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.xl,
  fontWeight: typography.fontWeight.bold,
  color: colors.primary.main,
});

const NavigationList = styled(List)({
  padding: `0 ${spacing.md}px`,
});

const StyledListItemButton = styled(ListItemButton)<{ active?: boolean }>(({ active }) => ({
  borderRadius: '8px',
  marginBottom: spacing.xs,
  padding: `${spacing.sm}px ${spacing.md}px`,
  transition: transitions.fast,

  ...(active && {
    backgroundColor: colors.primary.main,
    color: colors.primary.contrastText,

    '& .MuiListItemIcon-root': {
      color: colors.primary.contrastText,
    },

    '&:hover': {
      backgroundColor: colors.primary.dark,
    },
  }),

  ...(!active && {
    '&:hover': {
      backgroundColor: colors.grey[100],
    },
  }),
}));

const UserSection = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
  cursor: 'pointer',
  padding: `${spacing.xs}px ${spacing.sm}px`,
  borderRadius: '8px',
  transition: transitions.fast,

  '&:hover': {
    backgroundColor: colors.grey[100],
  },
});

const UserInfo = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',

  '@media (max-width: 600px)': {
    display: 'none',
  },
});

const UserName = styled(Typography)({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.semiBold,
  color: colors.grey[900],
  lineHeight: typography.lineHeight.tight,
});

const UserEmail = styled(Typography)({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.xs,
  color: colors.grey[600],
  lineHeight: typography.lineHeight.tight,
});

// ============================================================================
// DASHBOARD LAYOUT COMPONENT
// ============================================================================

/**
 * DashboardLayout - Reusable dashboard layout template
 *
 * @example
 * <DashboardLayout
 *   title="Project Dashboard"
 *   navigationItems={navItems}
 *   activeNavItem="projects"
 *   user={{ name: "John Doe", email: "john@example.com" }}
 * >
 *   <YourDashboardContent />
 * </DashboardLayout>
 */
export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  title = 'Dashboard',
  navigationItems = [],
  activeNavItem,
  user,
  userMenuItems = [],
  headerActions,
  sidebarOpen: controlledSidebarOpen,
  onSidebarToggle,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [internalSidebarOpen, setInternalSidebarOpen] = useState(true);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);

  // Use controlled or internal state
  const sidebarOpen = controlledSidebarOpen ?? internalSidebarOpen;
  const setSidebarOpen = (open: boolean) => {
    if (onSidebarToggle) {
      onSidebarToggle(open);
    } else {
      setInternalSidebarOpen(open);
    }
  };

  const handleDrawerToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const handleUserMenuItemClick = (onClick: () => void) => {
    onClick();
    handleUserMenuClose();
  };

  // Drawer content
  const drawerContent = (
    <>
      <LogoSection>
        <LogoText>Ectropy</LogoText>
      </LogoSection>

      <Divider />

      <NavigationList>
        {navigationItems.map(item => (
          <StyledListItemButton
            key={item.id}
            active={item.id === activeNavItem}
            onClick={() => {
              item.onClick?.();
              if (isMobile) {
                setSidebarOpen(false);
              }
            }}
          >
            {item.icon && <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>}
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{
                fontFamily: typography.fontFamily.primary,
                fontSize: typography.fontSize.base,
                fontWeight:
                  item.id === activeNavItem
                    ? typography.fontWeight.semiBold
                    : typography.fontWeight.regular,
              }}
            />
          </StyledListItemButton>
        ))}
      </NavigationList>
    </>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* App Bar */}
      <StyledAppBar position='fixed'>
        <Toolbar sx={{ minHeight: `${components.appBar.height}px !important` }}>
          <IconButton
            color='inherit'
            aria-label='toggle drawer'
            edge='start'
            onClick={handleDrawerToggle}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>

          <Typography
            variant='h6'
            noWrap
            component='div'
            sx={{
              flexGrow: 1,
              fontFamily: typography.fontFamily.primary,
              fontWeight: typography.fontWeight.semiBold,
            }}
          >
            {title}
          </Typography>

          {headerActions && <Box sx={{ mr: 2 }}>{headerActions}</Box>}

          {user && (
            <>
              <UserSection onClick={handleUserMenuOpen}>
                <Avatar
                  src={user.avatar}
                  alt={user.name}
                  sx={{
                    width: 36,
                    height: 36,
                    bgcolor: colors.primary.main,
                  }}
                >
                  {!user.avatar && user.name.charAt(0).toUpperCase()}
                </Avatar>
                <UserInfo>
                  <UserName>{user.name}</UserName>
                  {user.email && <UserEmail>{user.email}</UserEmail>}
                </UserInfo>
              </UserSection>

              <Menu
                anchorEl={userMenuAnchor}
                open={Boolean(userMenuAnchor)}
                onClose={handleUserMenuClose}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'right',
                }}
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'right',
                }}
              >
                {userMenuItems.map((item, index) => (
                  <MenuItem key={index} onClick={() => handleUserMenuItemClick(item.onClick)}>
                    {item.label}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
        </Toolbar>
      </StyledAppBar>

      {/* Sidebar Drawer */}
      {isMobile ? (
        <StyledDrawer
          variant='temporary'
          open={sidebarOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better mobile performance
          }}
        >
          {drawerContent}
        </StyledDrawer>
      ) : (
        <StyledDrawer variant='persistent' open={sidebarOpen}>
          {drawerContent}
        </StyledDrawer>
      )}

      {/* Main Content Area */}
      <ContentArea sidebarwidth={sidebarOpen && !isMobile ? components.drawer.width : 0}>
        {children}
      </ContentArea>
    </Box>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default DashboardLayout;
