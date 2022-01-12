import pkg from './package.json';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import { terser } from 'rollup-plugin-terser';
import visualizer from 'rollup-plugin-visualizer';
import copy from 'rollup-plugin-copy';

const extensions = ['.js', '.jsx', '.ts', '.tsx'];

function bundle(filename, options = {}) {
  return {
    input: 'src/index.ts',
    output: {
      file: filename,
      format: 'umd',
      name: 'CytoscapeLeaflet',
      sourcemap: true,
      globals: {
        cytoscape: 'cytoscape',
        leaflet: 'L',
      },
    },
    external: [...Object.keys(pkg.peerDependencies), 'fs', 'path'],
    plugins: [
      resolve({
        jsnext: true,
        extensions,
      }),
      commonjs(),
      babel({
        extensions,
        babelHelpers: 'runtime',
        exclude: 'node_modules/**',
      }),
      options.minimize ? terser() : false,
      options.stats
        ? visualizer({
            filename: filename + '.stats.html',
          })
        : false,
      copy({
        targets: [
          {
            src: ['src/index.d.ts', 'src/types.ts'],
            dest: 'dist/',
          },
        ],
      }),
    ],
  };
}

export default [
  bundle(pkg.browser.replace('.min', ''), { stats: true }),
  bundle(pkg.browser, { minimize: true }),
];
