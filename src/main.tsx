import { createRoot } from 'react-dom/client';
import PlayerApp from './player/PlayerApp';
import './index.css';

createRoot(document.getElementById('root')!).render(<PlayerApp />);
