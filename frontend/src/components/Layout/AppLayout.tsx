import React from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  useTheme,
  useMediaQuery,
  Avatar,
  Menu,
  MenuItem,
  Chip,
  Stack,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  PictureAsPdf,
  AccountTree,
  Person,
  Settings,
  Logout,
  Home,
  ChevronLeft,
  Notifications,
} from '@mui/icons-material';
import { useLocation, useNavigate, Link } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { LoadingScreen } from '@components/LoadingScreen';

const DRAWER_WIDTH = 240;

interface AppLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
  showHeader?: boolean;
}

interface NavigationItem {
  label: string;
  path: string;
  icon: React.ReactElement;
  roles?: string[];
  badge?: string | number;
}

const navigationItems: NavigationItem[] = [
  {
    label: 'Home',
    path: '/',
    icon: <Home />,
  },
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: <Dashboard />,
    roles: ['admin', 'provider'],
  },
  {
    label: 'PDF Viewer',
    path: '/pdf',
    icon: <PictureAsPdf />,
  },
  {
    label: 'Workflows',
    path: '/workflow',
    icon: <AccountTree />,
    roles: ['admin', 'provider'],
  },
  {
    label: 'Profile',
    path: '/profile',
    icon: <Person />,
  },
];

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  showSidebar = true,
  showHeader = true,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const navigate = useNavigate();
  
  const { user, isLoading, handleLogout, hasRole } = useAuth();

  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = React.useState<null | HTMLElement>(null);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const handleLogoutClick = async () => {
    handleUserMenuClose();
    await handleLogout();
    navigate('/login');
  };

  const isCurrentPath = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const filteredNavigationItems = navigationItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.some(role => hasRole(role));
  });

  // Loading state
  if (isLoading) {
    return <LoadingScreen message="Loading application..." />;
  }

  // Sidebar content
  const sidebarContent = (
    <Box>
      {/* Logo/Brand */}
      <Toolbar
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
          minHeight: 64,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography
          variant="h6"
          component={Link}
          to="/"
          sx={{
            fontWeight: 700,
            color: 'primary.main',
            textDecoration: 'none',
            letterSpacing: 0.5,
          }}
        >
          MVE
        </Typography>
      </Toolbar>

      {/* Navigation */}
      <List sx={{ px: 1, py: 2 }}>
        {filteredNavigationItems.map((item) => (
          <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              component={Link}
              to={item.path}
              selected={isCurrentPath(item.path)}
              sx={{
                borderRadius: 2,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '& .MuiListItemIcon-root': {
                    color: 'primary.contrastText',
                  },
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                },
                '&:hover': {
                  bgcolor: 'action.hover',
                },
              }}
              onClick={() => isMobile && setMobileOpen(false)}
            >
              <ListItemIcon
                sx={{
                  minWidth: 40,
                  color: isCurrentPath(item.path) ? 'inherit' : 'text.secondary',
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                sx={{ 
                  '& .MuiListItemText-primary': {
                    fontSize: '0.9rem',
                    fontWeight: isCurrentPath(item.path) ? 600 : 400,
                  },
                }}
              />
              {item.badge && (
                <Chip
                  label={item.badge}
                  size="small"
                  color="secondary"
                  sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                />
              )}
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider sx={{ mx: 2 }} />

      {/* User Info Section */}
      {user && (
        <Box sx={{ p: 2, mt: 'auto' }}>
          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            sx={{
              p: 1.5,
              bgcolor: 'action.hover',
              borderRadius: 2,
            }}
          >
            <Avatar
              src={user.picture}
              alt={user.name}
              sx={{ width: 32, height: 32 }}
            >
              {user.name?.[0] || user.email[0]}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" noWrap>
                {user.name || 'User'}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {user.email}
              </Typography>
            </Box>
          </Stack>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* App Bar */}
      {showHeader && (
        <AppBar
          position="fixed"
          sx={{
            width: { md: showSidebar ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%' },
            ml: { md: showSidebar ? `${DRAWER_WIDTH}px` : 0 },
            zIndex: theme.zIndex.drawer + 1,
          }}
        >
          <Toolbar>
            {/* Mobile menu button */}
            {showSidebar && (
              <IconButton
                color="inherit"
                edge="start"
                onClick={handleDrawerToggle}
                sx={{ mr: 2, display: { md: 'none' } }}
              >
                <MenuIcon />
              </IconButton>
            )}

            {/* Page title */}
            <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
              {/* You can customize this based on current route */}
              MVE
            </Typography>

            {/* Header actions */}
            <Stack direction="row" spacing={1} alignItems="center">
              <IconButton color="inherit" size="large">
                <Notifications />
              </IconButton>

              {user && (
                <>
                  <IconButton
                    size="large"
                    onClick={handleUserMenuOpen}
                    color="inherit"
                  >
                    <Avatar
                      src={user.picture}
                      alt={user.name}
                      sx={{ width: 32, height: 32 }}
                    >
                      {user.name?.[0] || user.email[0]}
                    </Avatar>
                  </IconButton>

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
                    <MenuItem onClick={() => { handleUserMenuClose(); navigate('/profile'); }}>
                      <ListItemIcon>
                        <Person fontSize="small" />
                      </ListItemIcon>
                      Profile
                    </MenuItem>
                    <MenuItem onClick={() => { handleUserMenuClose(); navigate('/settings'); }}>
                      <ListItemIcon>
                        <Settings fontSize="small" />
                      </ListItemIcon>
                      Settings
                    </MenuItem>
                    <Divider />
                    <MenuItem onClick={handleLogoutClick}>
                      <ListItemIcon>
                        <Logout fontSize="small" />
                      </ListItemIcon>
                      Logout
                    </MenuItem>
                  </Menu>
                </>
              )}
            </Stack>
          </Toolbar>
        </AppBar>
      )}

      {/* Sidebar */}
      {showSidebar && (
        <>
          {/* Mobile drawer */}
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{
              keepMounted: true, // Better open performance on mobile
            }}
            sx={{
              display: { xs: 'block', md: 'none' },
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: DRAWER_WIDTH,
              },
            }}
          >
            {sidebarContent}
          </Drawer>

          {/* Desktop drawer */}
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: 'none', md: 'block' },
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: DRAWER_WIDTH,
                borderRight: `1px solid ${theme.palette.divider}`,
              },
            }}
            open
          >
            {sidebarContent}
          </Drawer>
        </>
      )}

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { 
            md: showSidebar ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%' 
          },
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {showHeader && <Toolbar />} {/* Spacer for fixed app bar */}
        
        <Box
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default AppLayout;