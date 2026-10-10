// Generates the PNG app icons in public/ from public/favicon.svg:  npm run icons
import { defineConfig, type Preset } from '@vite-pwa/assets-generator/config';

const preset: Preset = {
  transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']] },
  maskable: { sizes: [512], padding: 0, resizeOptions: { background: '#e8590c' } },
  apple: { sizes: [180], padding: 0, resizeOptions: { background: '#e8590c' } },
};

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset,
  images: ['public/favicon.svg'],
});
