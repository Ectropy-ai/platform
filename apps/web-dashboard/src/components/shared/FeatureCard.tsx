import { Card, CardContent, Typography, Box } from '@mui/material';
import { ReactNode } from 'react';

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  metric?: string;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description, metric }) => {
  return (
    <Card
      component="article"
      sx={{
        height: '100%',
        transition: 'all 0.3s ease-in-out',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 8,
        },
      }}
    >
      <CardContent>
        <Box sx={{ color: 'primary.main', mb: 2 }}>{icon}</Box>
        <Typography variant='h6' component='h3' gutterBottom fontWeight={600}>
          {title}
        </Typography>
        <Typography variant='body2' color='text.secondary' mb={2}>
          {description}
        </Typography>
        {metric && (
          <Typography variant='h6' color='primary.main' fontWeight={700}>
            {metric}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};
