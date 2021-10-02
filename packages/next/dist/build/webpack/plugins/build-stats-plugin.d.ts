import type webpack from 'webpack';
export default class BuildStatsPlugin {
    private distDir;
    constructor(options: {
        distDir: string;
    });
    apply(compiler: webpack.Compiler): void;
}
