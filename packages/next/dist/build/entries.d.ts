import { __ApiPreviewProps } from '../server/api-utils';
import { LoadedEnvFiles } from '@next/env';
import { NextConfigComplete } from '../server/config-shared';
import type webpack5 from 'webpack5';
declare type PagesMapping = {
    [page: string]: string;
};
export declare function createPagesMapping(pagePaths: string[], extensions: string[], isWebpack5: boolean, isDev: boolean): PagesMapping;
declare type Entrypoints = {
    client: webpack5.EntryObject;
    server: webpack5.EntryObject;
};
export declare function createEntrypoints(pages: PagesMapping, target: 'server' | 'serverless' | 'experimental-serverless-trace', buildId: string, previewMode: __ApiPreviewProps, config: NextConfigComplete, loadedEnvFiles: LoadedEnvFiles): Entrypoints;
export declare function finalizeEntrypoint(name: string, value: any, isServer: boolean, isWebpack5: boolean): any;
export {};
