import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// No StrictMode: it mounts effects twice in development, which would attach the canvas sync twice.
createRoot(document.getElementById('root')!).render(<App />);
