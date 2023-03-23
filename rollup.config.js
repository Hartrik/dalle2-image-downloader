import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import pkg from './package.json';

export default [
    // browser-friendly UMD build
    {
        input: 'src/main.js',
        output: {
            name: 'Downloader',
            file: pkg.browser,
            format: 'umd'
        },
        plugins: [
            resolve(), // so Rollup can find libraries
            commonjs() // so Rollup can convert libraries to an ES modules
        ]
    }
];
