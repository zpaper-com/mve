import React, { useState } from 'react';
import {
  Avatar,
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  Chip,
} from '@mui/material';
import {
  AccountCircle,
  Settings,
  Logout,
  AdminPanelSettings,
  LocalHospital,
  Person,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { logger } from '../../utils/logger';

interface UserMenuProps {
  showFullName?: boolean;
}

export function UserMenu({ showFullName = false }: UserMenuProps) {
  const { user, handleLogout, isAdmin, hasRole } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleProfile = () => {
    handleClose();
    navigate('/profile');
  };

  const handleSettings = () => {
    handleClose();
    navigate('/settings');
  };

  const handleAdmin = () => {
    handleClose();
    navigate('/admin');
  };

  const handleLogoutClick = async () => {
    handleClose();
    try {
      await handleLogout();
      navigate('/login');
    } catch (error) {
      logger.error('Logout failed:', error);
    }
  };

  if (!user) {
    return null;
  }

  // Get role icon
  const getRoleIcon = () => {
    if (hasRole('admin')) return <AdminPanelSettings fontSize="small" />;
    if (hasRole('provider')) return <LocalHospital fontSize="small" />;
    return <Person fontSize="small" />;
  };

  // Get role color
  const getRoleColor = () => {
    if (hasRole('admin')) return 'error';
    if (hasRole('provider')) return 'primary';
    return 'default';
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {showFullName && (
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          <Typography variant="body2" color="text.primary">
            {user.name || user.email}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {user.roles.map(role => role.charAt(0).toUpperCase() + role.slice(1)).join(', ')}
          </Typography>
        </Box>
      )}

      <Tooltip title="Account settings">
        <IconButton
          onClick={handleClick}
          size="small"
          sx={{ ml: 2 }}
          aria-controls={open ? 'account-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
        >
          <Avatar
            sx={{ width: 32, height: 32 }}
            src={user.picture}
            alt={user.name || user.email}
          >
            {(user.name || user.email).charAt(0).toUpperCase()}
          </Avatar>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        id="account-menu"
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        PaperProps={{
          elevation: 0,
          sx: {
            overflow: 'visible',
            filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
            mt: 1.5,
            minWidth: 240,
            '& .MuiAvatar-root': {
              width: 32,
              height: 32,
              ml: -0.5,
              mr: 1,
            },
            '&:before': {
              content: '""',
              display: 'block',
              position: 'absolute',
              top: 0,
              right: 14,
              width: 10,
              height: 10,
              bgcolor: 'background.paper',
              transform: 'translateY(-50%) rotate(45deg)',
              zIndex: 0,
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {/* User Info Header */}
        <MenuItem disabled sx={{ opacity: 1, cursor: 'default' }}>
          <Avatar src={user.picture} alt={user.name || user.email}>
            {(user.name || user.email).charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ ml: 1 }}>
            <Typography variant="body2" fontWeight="medium">
              {user.name || user.email}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
              {user.roles.map((role) => (
                <Chip
                  key={role}
                  label={role.charAt(0).toUpperCase() + role.slice(1)}
                  size="small"
                  color={getRoleColor() as any}
                  variant="outlined"
                  icon={getRoleIcon()}
                />
              ))}
            </Box>
            {!user.emailVerified && (
              <Typography variant="caption" color="warning.main">
                Email not verified
              </Typography>
            )}
          </Box>
        </MenuItem>

        <Divider />

        {/* Profile */}
        <MenuItem onClick={handleProfile}>
          <ListItemIcon>
            <AccountCircle fontSize="small" />
          </ListItemIcon>
          <ListItemText>Profile</ListItemText>
        </MenuItem>

        {/* Settings */}
        <MenuItem onClick={handleSettings}>
          <ListItemIcon>
            <Settings fontSize="small" />
          </ListItemIcon>
          <ListItemText>Settings</ListItemText>
        </MenuItem>

        {/* Admin Panel (Admin only) */}
        {isAdmin() && (
          <MenuItem onClick={handleAdmin}>
            <ListItemIcon>
              <AdminPanelSettings fontSize="small" />
            </ListItemIcon>
            <ListItemText>Admin Panel</ListItemText>
          </MenuItem>
        )}

        <Divider />

        {/* Logout */}
        <MenuItem onClick={handleLogoutClick}>
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          <ListItemText>Sign out</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}

// Simplified user avatar component
export function UserAvatar({ size = 40 }: { size?: number }) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <Avatar
      sx={{ width: size, height: size }}
      src={user.picture}
      alt={user.name || user.email}
    >
      {(user.name || user.email).charAt(0).toUpperCase()}
    </Avatar>
  );
}