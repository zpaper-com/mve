import { Box, Typography, Button, Container } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  return (
    <Container maxWidth="md">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          textAlign: 'center',
          gap: 3,
        }}
      >
        <Typography variant="h3" component="h1" gutterBottom>
          MVE - PDF Workflow System
        </Typography>
        <Typography variant="h6" color="text.secondary" paragraph>
          Sequential PDF form completion by multiple parties
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate('/merx')}
          sx={{ px: 4, py: 2 }}
        >
          View Merx PDF
        </Button>
      </Box>
    </Container>
  );
};

export default Home;