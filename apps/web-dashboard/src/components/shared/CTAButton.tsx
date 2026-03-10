import { Button, ButtonProps } from '@mui/material';
import { styled } from '@mui/material/styles';

const StyledButton = styled(Button)(({ theme }) => ({
  fontWeight: 600,
  padding: '12px 32px',
  fontSize: '1rem',
  transition: 'all 0.3s ease-in-out',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: theme.shadows[8],
  },
}));

export const CTAButton: React.FC<ButtonProps> = props => {
  return <StyledButton {...props} />;
};
