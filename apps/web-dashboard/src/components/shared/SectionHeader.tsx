import { Box, Typography } from '@mui/material';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  align?: 'left' | 'center' | 'right';
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  description,
  align = 'left',
}) => {
  return (
    <Box sx={{ textAlign: align, mb: 4 }}>
      {subtitle && (
        <Typography
          variant='overline'
          color='primary'
          fontWeight={600}
          sx={{ display: 'block', mb: 1 }}
        >
          {subtitle}
        </Typography>
      )}
      <Typography variant='h3' component='h2' fontWeight={700} gutterBottom>
        {title}
      </Typography>
      {description && (
        <Typography variant='body1' color='text.secondary' mt={2}>
          {description}
        </Typography>
      )}
    </Box>
  );
};
