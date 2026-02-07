import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  clean: true,
  dts: false,
});
