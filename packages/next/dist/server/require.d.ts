/**
 * `require(...)` a module within an isolated VM context, which prevents the
 * module from sharing the same context as Next and potentially contaminating
 * Next's own logic (i.e., by shimming globals).
 *
 * This should be used to load all React components for SSR.
 * @see requirePage
 *
 * @param specifier The module to load.
 * @returns The loaded module.
 */
export declare function isolatedRequire(specifier: string): any;
export declare function pageNotFoundError(page: string): Error;
export declare function getPagePath(page: string, distDir: string, serverless: boolean, dev?: boolean, locales?: string[]): string;
export declare function requirePage(page: string, distDir: string, serverless: boolean): any;
export declare function requireFontManifest(distDir: string, serverless: boolean): any;
