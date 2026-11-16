import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.css';
import { startApp } from './ui/app';

startApp().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#e11d48;padding:1rem;white-space:pre-wrap">Erreur au démarrage : ${String(e)}</pre>`);
});
