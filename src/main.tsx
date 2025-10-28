import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Create root and render without StrictMode to avoid double renders
createRoot(document.getElementById('root')!).render(<App />);