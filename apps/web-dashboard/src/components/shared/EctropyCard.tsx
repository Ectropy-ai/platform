import { Card, CardProps } from '@mui/material';
import { styled } from '@mui/material/styles';

interface EctropyCardProps extends CardProps {
  hover?: boolean;
}

const StyledCard = styled(Card, {
  shouldForwardProp: prop => prop !== 'hover',
})<EctropyCardProps>(({ theme, hover }) => ({
  transition: 'all 0.3s ease-in-out',
  ...(hover && {
    '&:hover': {
      transform: 'translateY(-4px)',
      boxShadow: theme.shadows[8],
    },
  }),
}));

export const EctropyCard: React.FC<EctropyCardProps> = ({ hover = false, ...props }) => {
  return <StyledCard hover={hover} component="article" {...props} />;
};
