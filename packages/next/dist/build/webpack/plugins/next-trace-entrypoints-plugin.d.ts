import { Span } from '../../../trace';
import { webpack } from 'next/dist/compiled/webpack/webpack';
export declare class TraceEntryPointsPlugin implements webpack.Plugin {
    private appDir;
    private entryTraces;
    private excludeFiles;
    constructor({ appDir, excludeFiles, }: {
        appDir: string;
        excludeFiles?: string[];
    });
    createTraceAssets(compilation: any, assets: any, span: Span): void;
    tapfinishModules(compilation: webpack.compilation.Compilation, traceEntrypointsPluginSpan: Span, doResolve?: (request: string, parent: string, job: import('@vercel/nft/out/node-file-trace').Job) => Promise<string>): void;
    apply(compiler: webpack.Compiler): void;
}
