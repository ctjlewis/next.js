"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
var _path = _interopRequireDefault(require("path"));
var _profilingPlugin = require("./profiling-plugin");
var _isError = _interopRequireDefault(require("../../../lib/is-error"));
var _nft = require("next/dist/compiled/@vercel/nft");
var _constants = require("../../../shared/lib/constants");
var _webpack = require("next/dist/compiled/webpack/webpack");
var _webpackConfig = require("../../webpack-config");
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
const PLUGIN_NAME = 'TraceEntryPointsPlugin';
const TRACE_IGNORES = [
    '**/*/node_modules/react/**/*.development.js',
    '**/*/node_modules/react-dom/**/*.development.js',
    '**/*/next/dist/server/next.js',
    '**/*/next/dist/bin/next', 
];
function getModuleFromDependency(compilation, dep) {
    if (_webpack.isWebpack5) {
        return compilation.moduleGraph.getModule(dep);
    }
    return dep.module;
}
class TraceEntryPointsPlugin {
    constructor({ appDir , excludeFiles  }){
        this.appDir = appDir;
        this.entryTraces = new Map();
        this.excludeFiles = excludeFiles || [];
    }
    // Here we output all traced assets and webpack chunks to a
    // ${page}.js.nft.json file
    createTraceAssets(compilation, assets, span) {
        const outputPath = compilation.outputOptions.path;
        const nodeFileTraceSpan = span.traceChild('create-trace-assets');
        nodeFileTraceSpan.traceFn(()=>{
            for (const entrypoint of compilation.entrypoints.values()){
                const entryFiles = new Set();
                for (const chunk of entrypoint.getEntrypointChunk().getAllReferencedChunks()){
                    for (const file of chunk.files){
                        entryFiles.add(_path.default.join(outputPath, file));
                    }
                    for (const file1 of chunk.auxiliaryFiles){
                        entryFiles.add(_path.default.join(outputPath, file1));
                    }
                }
                // don't include the entry itself in the trace
                entryFiles.delete(_path.default.join(outputPath, `${_webpack.isWebpack5 ? '../' : ''}${entrypoint.name}.js`));
                const traceOutputName = `${_webpack.isWebpack5 ? '../' : ''}${entrypoint.name}.js.nft.json`;
                const traceOutputPath = _path.default.dirname(_path.default.join(outputPath, traceOutputName));
                assets[traceOutputName] = new _webpack.sources.RawSource(JSON.stringify({
                    version: _constants.TRACE_OUTPUT_VERSION,
                    files: [
                        ...entryFiles,
                        ...this.entryTraces.get(entrypoint.name) || [], 
                    ].map((file)=>{
                        return _path.default.relative(traceOutputPath, file).replace(/\\/g, '/');
                    })
                }));
            }
        });
    }
    tapfinishModules(compilation, traceEntrypointsPluginSpan, doResolve) {
        compilation.hooks.finishModules.tapAsync(PLUGIN_NAME, async (_stats, callback)=>{
            const finishModulesSpan = traceEntrypointsPluginSpan.traceChild('finish-modules');
            await finishModulesSpan.traceAsyncFn(async ()=>{
                // we create entry -> module maps so that we can
                // look them up faster instead of having to iterate
                // over the compilation modules list
                const entryNameMap = new Map();
                const entryModMap = new Map();
                const additionalEntries = new Map();
                const depModMap = new Map();
                finishModulesSpan.traceChild('get-entries').traceFn(()=>{
                    compilation.entries.forEach((entry)=>{
                        var ref;
                        const name = entry.name || ((ref = entry.options) === null || ref === void 0 ? void 0 : ref.name);
                        if (name === null || name === void 0 ? void 0 : name.replace(/\\/g, '/').startsWith('pages/')) {
                            for (const dep of entry.dependencies){
                                if (!dep) continue;
                                const entryMod = getModuleFromDependency(compilation, dep);
                                if (entryMod && entryMod.resource) {
                                    if (entryMod.resource.replace(/\\/g, '/').includes('pages/')) {
                                        entryNameMap.set(entryMod.resource, name);
                                        entryModMap.set(entryMod.resource, entryMod);
                                    } else {
                                        let curMap = additionalEntries.get(name);
                                        if (!curMap) {
                                            curMap = new Map();
                                            additionalEntries.set(name, curMap);
                                        }
                                        curMap.set(entryMod.resource, entryMod);
                                    }
                                }
                            }
                        }
                    });
                });
                const readFile = async (path)=>{
                    var ref;
                    const mod = depModMap.get(path) || entryModMap.get(path);
                    // map the transpiled source when available to avoid
                    // parse errors in node-file-trace
                    const source = mod === null || mod === void 0 ? void 0 : (ref = mod.originalSource) === null || ref === void 0 ? void 0 : ref.call(mod);
                    if (source) {
                        return source.buffer();
                    }
                    try {
                        return await new Promise((resolve, reject)=>{
                            compilation.inputFileSystem.readFile(path, (err, data)=>{
                                if (err) return reject(err);
                                resolve(data);
                            });
                        });
                    } catch (e) {
                        if ((0, _isError).default(e) && (e.code === 'ENOENT' || e.code === 'EISDIR')) {
                            return null;
                        }
                        throw e;
                    }
                };
                const readlink = async (path)=>{
                    try {
                        return await new Promise((resolve, reject)=>{
                            compilation.inputFileSystem.readlink(path, (err, link)=>{
                                if (err) return reject(err);
                                resolve(link);
                            });
                        });
                    } catch (e) {
                        if ((0, _isError).default(e) && (e.code === 'EINVAL' || e.code === 'ENOENT' || e.code === 'UNKNOWN')) {
                            return null;
                        }
                        throw e;
                    }
                };
                const stat = async (path)=>{
                    try {
                        return await new Promise((resolve, reject)=>{
                            compilation.inputFileSystem.stat(path, (err, stats)=>{
                                if (err) return reject(err);
                                resolve(stats);
                            });
                        });
                    } catch (e) {
                        if ((0, _isError).default(e) && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) {
                            return null;
                        }
                        throw e;
                    }
                };
                const nftCache = {
                };
                const entryPaths = Array.from(entryModMap.keys());
                for (const entry of entryPaths){
                    const entrySpan = finishModulesSpan.traceChild('entry', {
                        entry
                    });
                    await entrySpan.traceAsyncFn(async ()=>{
                        depModMap.clear();
                        const entryMod = entryModMap.get(entry);
                        // TODO: investigate caching, will require ensuring no traced
                        // files in the cache have changed, we could potentially hash
                        // all traced files and only leverage the cache if the hashes
                        // match
                        // const cachedTraces = entryMod.buildInfo?.cachedNextEntryTrace
                        // Use cached trace if available and trace version matches
                        // if (
                        //   isWebpack5 &&
                        //   cachedTraces &&
                        //   cachedTraces.version === TRACE_OUTPUT_VERSION
                        // ) {
                        //   this.entryTraces.set(
                        //     entryNameMap.get(entry)!,
                        //     cachedTraces.tracedDeps
                        //   )
                        //   continue
                        // }
                        const collectDependencies = (mod)=>{
                            if (!mod || !mod.dependencies) return;
                            for (const dep of mod.dependencies){
                                const depMod = getModuleFromDependency(compilation, dep);
                                if ((depMod === null || depMod === void 0 ? void 0 : depMod.resource) && !depModMap.get(depMod.resource)) {
                                    depModMap.set(depMod.resource, depMod);
                                    collectDependencies(depMod);
                                }
                            }
                        };
                        collectDependencies(entryMod);
                        const toTrace = [
                            entry
                        ];
                        const entryName = entryNameMap.get(entry);
                        const curExtraEntries = additionalEntries.get(entryName);
                        if (curExtraEntries) {
                            toTrace.push(...curExtraEntries.keys());
                        }
                        const root = _path.default.parse(process.cwd()).root;
                        const fileTraceSpan = entrySpan.traceChild('node-file-trace');
                        const result = await fileTraceSpan.traceAsyncFn(()=>(0, _nft).nodeFileTrace(toTrace, {
                                base: root,
                                cache: nftCache,
                                processCwd: this.appDir,
                                readFile,
                                readlink,
                                stat,
                                resolve: doResolve ? (id, parent, job, _isCjs)=>doResolve(id, parent, job)
                                 : undefined,
                                ignore: [
                                    ...TRACE_IGNORES,
                                    ...this.excludeFiles
                                ],
                                mixedModules: true
                            })
                        );
                        const tracedDeps = [];
                        for (const file of result.fileList){
                            var ref, ref1;
                            // don't include the entry itself
                            if (result.reasons[file].type === 'initial') {
                                continue;
                            }
                            const filepath = _path.default.join(root, file);
                            // don't include transpiled files as they are included
                            // in the webpack output (e.g. chunks or the entry itself)
                            if ((ref = depModMap.get(filepath)) === null || ref === void 0 ? void 0 : (ref1 = ref.originalSource) === null || ref1 === void 0 ? void 0 : ref1.call(ref)) {
                                continue;
                            }
                            tracedDeps.push(filepath);
                        }
                        // entryMod.buildInfo.cachedNextEntryTrace = {
                        //   version: TRACE_OUTPUT_VERSION,
                        //   tracedDeps,
                        // }
                        this.entryTraces.set(entryName, tracedDeps);
                    });
                }
            }).then(()=>callback()
            , (err)=>callback(err)
            );
        });
    }
    apply(compiler) {
        if (_webpack.isWebpack5) {
            compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation)=>{
                const compilationSpan = _profilingPlugin.spans.get(compilation) || _profilingPlugin.spans.get(compiler);
                const traceEntrypointsPluginSpan = compilationSpan.traceChild('next-trace-entrypoint-plugin');
                traceEntrypointsPluginSpan.traceFn(()=>{
                    // @ts-ignore TODO: Remove ignore when webpack 5 is stable
                    compilation.hooks.processAssets.tap({
                        name: PLUGIN_NAME,
                        // @ts-ignore TODO: Remove ignore when webpack 5 is stable
                        stage: _webpack.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE
                    }, (assets)=>{
                        this.createTraceAssets(compilation, assets, traceEntrypointsPluginSpan);
                    });
                    let resolver = compilation.resolverFactory.get('normal');
                    resolver = resolver.withOptions({
                        ..._webpackConfig.NODE_RESOLVE_OPTIONS,
                        extensions: undefined
                    });
                    function getPkgName(name) {
                        const segments = name.split('/');
                        if (name[0] === '@' && segments.length > 1) return segments.length > 1 ? segments.slice(0, 2).join('/') : null;
                        return segments.length ? segments[0] : null;
                    }
                    const doResolve = async (request, parent, job)=>{
                        return new Promise((resolve, reject)=>{
                            resolver.resolve({
                            }, _path.default.dirname(parent), request, {
                                fileDependencies: compilation.fileDependencies,
                                missingDependencies: compilation.missingDependencies,
                                contextDependencies: compilation.contextDependencies
                            }, async (err, result, context)=>{
                                if (err) return reject(err);
                                if (!result) {
                                    return reject(new Error('module not found'));
                                }
                                try {
                                    if (result.includes('node_modules')) {
                                        let requestPath = result;
                                        if (!_path.default.isAbsolute(request) && request.includes('/') && (context === null || context === void 0 ? void 0 : context.descriptionFileRoot)) {
                                            var ref;
                                            requestPath = context.descriptionFileRoot + request.substr(((ref = getPkgName(request)) === null || ref === void 0 ? void 0 : ref.length) || 0) + _path.default.sep + 'package.json';
                                        }
                                        // the descriptionFileRoot is not set to the last used
                                        // package.json so we use nft's resolving for this
                                        // see test/integration/build-trace-extra-entries/app/node_modules/nested-structure for example
                                        const packageJsonResult = await job.getPjsonBoundary(requestPath);
                                        if (packageJsonResult) {
                                            await job.emitFile(packageJsonResult + _path.default.sep + 'package.json', 'resolve', parent);
                                        }
                                    }
                                } catch (_err) {
                                // we failed to resolve the package.json boundary,
                                // we don't block emitting the initial asset from this
                                }
                                resolve(result);
                            });
                        });
                    };
                    this.tapfinishModules(compilation, traceEntrypointsPluginSpan, doResolve);
                });
            });
        } else {
            compiler.hooks.emit.tap(PLUGIN_NAME, (compilation)=>{
                const compilationSpan = _profilingPlugin.spans.get(compilation) || _profilingPlugin.spans.get(compiler);
                const traceEntrypointsPluginSpan = compilationSpan.traceChild('next-trace-entrypoint-plugin');
                traceEntrypointsPluginSpan.traceFn(()=>{
                    this.createTraceAssets(compilation, compilation.assets, traceEntrypointsPluginSpan);
                });
            });
            compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation)=>{
                const compilationSpan = _profilingPlugin.spans.get(compilation) || _profilingPlugin.spans.get(compiler);
                const traceEntrypointsPluginSpan = compilationSpan.traceChild('next-trace-entrypoint-plugin');
                traceEntrypointsPluginSpan.traceFn(()=>this.tapfinishModules(compilation, traceEntrypointsPluginSpan)
                );
            });
        }
    }
}
exports.TraceEntryPointsPlugin = TraceEntryPointsPlugin;

//# sourceMappingURL=next-trace-entrypoints-plugin.js.map