import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        contact: resolve(__dirname, 'contact.html'),
        advertising: resolve(__dirname, 'work/advertising.html'),
        connected: resolve(__dirname, 'work/connected-experience.html'),
        ripple: resolve(__dirname, 'work/ripple-system.html'),
        student: resolve(__dirname, 'work/student-travel.html'),
        target: resolve(__dirname, 'work/target-microsite.html'),
        work_based: resolve(__dirname, 'work/work-based-learning.html'),
      },
    },
  },
});
