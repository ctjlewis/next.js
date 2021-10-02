import { webpack } from 'next/dist/compiled/webpack/webpack';
import { Span } from '../trace';
export declare type CompilerResult = {
    errors: string[];
    warnings: string[];
};
export declare function runCompiler(config: webpack.Configuration, { runWebpackSpan }: {
    runWebpackSpan: Span;
}): Promise<CompilerResult>;
