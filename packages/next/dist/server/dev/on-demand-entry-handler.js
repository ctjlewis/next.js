"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = onDemandEntryHandler;
exports.entries = exports.BUILDING = exports.ADDED = exports.BUILT = void 0;
var _events = require("events");
var _path = require("path");
var _url = require("url");
var _webpack = require("next/dist/compiled/webpack/webpack");
var Log = _interopRequireWildcard(require("../../build/output/log"));
var _normalizePagePath = require("../normalize-page-path");
var _require = require("../require");
var _findPageFile = require("../lib/find-page-file");
var _getRouteFromEntrypoint = _interopRequireDefault(require("../get-route-from-entrypoint"));
var _constants = require("../../lib/constants");
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function _interopRequireWildcard(obj) {
    if (obj && obj.__esModule) {
        return obj;
    } else {
        var newObj = {
        };
        if (obj != null) {
            for(var key in obj){
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {
                    };
                    if (desc.get || desc.set) {
                        Object.defineProperty(newObj, key, desc);
                    } else {
                        newObj[key] = obj[key];
                    }
                }
            }
        }
        newObj.default = obj;
        return newObj;
    }
}
const ADDED = Symbol('added');
exports.ADDED = ADDED;
const BUILDING = Symbol('building');
exports.BUILDING = BUILDING;
const BUILT = Symbol('built');
exports.BUILT = BUILT;
let entries = {
};
exports.entries = entries;
function onDemandEntryHandler(watcher, multiCompiler, { pagesDir , pageExtensions , maxInactiveAge , pagesBufferLength  }) {
    const { compilers  } = multiCompiler;
    const invalidator = new Invalidator(watcher, multiCompiler);
    let lastClientAccessPages = [
        ''
    ];
    let doneCallbacks = new _events.EventEmitter();
    for (const compiler of compilers){
        compiler.hooks.make.tap('NextJsOnDemandEntries', (_compilation)=>{
            invalidator.startBuilding();
        });
    }
    function getPagePathsFromEntrypoints(type, entrypoints) {
        const pagePaths = [];
        for (const entrypoint of entrypoints.values()){
            const page = (0, _getRouteFromEntrypoint).default(entrypoint.name);
            if (page) {
                pagePaths.push(`${type}${page}`);
            }
        }
        return pagePaths;
    }
    multiCompiler.hooks.done.tap('NextJsOnDemandEntries', (multiStats)=>{
        if (invalidator.rebuildAgain) {
            return invalidator.doneBuilding();
        }
        const [clientStats, serverStats] = multiStats.stats;
        const pagePaths = [
            ...getPagePathsFromEntrypoints('client', clientStats.compilation.entrypoints),
            ...getPagePathsFromEntrypoints('server', serverStats.compilation.entrypoints), 
        ];
        for (const page of pagePaths){
            const entry = entries[page];
            if (!entry) {
                continue;
            }
            if (entry.status !== BUILDING) {
                continue;
            }
            entry.status = BUILT;
            doneCallbacks.emit(page);
        }
        invalidator.doneBuilding();
    });
    const disposeHandler = setInterval(function() {
        disposeInactiveEntries(watcher, lastClientAccessPages, maxInactiveAge);
    }, 5000);
    disposeHandler.unref();
    function handlePing(pg) {
        const page = (0, _normalizePagePath).normalizePathSep(pg);
        const pageKey = `client${page}`;
        const entryInfo = entries[pageKey];
        let toSend;
        // If there's no entry, it may have been invalidated and needs to be re-built.
        if (!entryInfo) {
            // if (page !== lastEntry) client pings, but there's no entry for page
            return {
                invalid: true
            };
        }
        // 404 is an on demand entry but when a new page is added we have to refresh the page
        if (page === '/_error') {
            toSend = {
                invalid: true
            };
        } else {
            toSend = {
                success: true
            };
        }
        // We don't need to maintain active state of anything other than BUILT entries
        if (entryInfo.status !== BUILT) return;
        // If there's an entryInfo
        if (!lastClientAccessPages.includes(pageKey)) {
            lastClientAccessPages.unshift(pageKey);
            // Maintain the buffer max length
            if (lastClientAccessPages.length > pagesBufferLength) {
                lastClientAccessPages.pop();
            }
        }
        entryInfo.lastActiveTime = Date.now();
        return toSend;
    }
    return {
        async ensurePage (page, clientOnly) {
            let normalizedPagePath;
            try {
                normalizedPagePath = (0, _normalizePagePath).normalizePagePath(page);
            } catch (err) {
                console.error(err);
                throw (0, _require).pageNotFoundError(page);
            }
            let pagePath = await (0, _findPageFile).findPageFile(pagesDir, normalizedPagePath, pageExtensions);
            // Default the /_error route to the Next.js provided default page
            if (page === '/_error' && pagePath === null) {
                pagePath = 'next/dist/pages/_error';
            }
            if (pagePath === null) {
                throw (0, _require).pageNotFoundError(normalizedPagePath);
            }
            let pageUrl = pagePath.replace(/\\/g, '/');
            pageUrl = `${pageUrl[0] !== '/' ? '/' : ''}${pageUrl.replace(new RegExp(`\\.+(?:${pageExtensions.join('|')})$`), '').replace(/\/index$/, '')}`;
            pageUrl = pageUrl === '' ? '/' : pageUrl;
            const bundleFile = (0, _normalizePagePath).normalizePagePath(pageUrl);
            const bundlePath = _path.posix.join('pages', bundleFile);
            const absolutePagePath = pagePath.startsWith('next/dist/pages') ? require.resolve(pagePath) : (0, _path).join(pagesDir, pagePath);
            page = _path.posix.normalize(pageUrl);
            const normalizedPage = (0, _normalizePagePath).normalizePathSep(page);
            const isApiRoute = normalizedPage.match(_constants.API_ROUTE);
            let entriesChanged = false;
            const addPageEntry = (type)=>{
                return new Promise((resolve, reject)=>{
                    // Makes sure the page that is being kept in on-demand-entries matches the webpack output
                    const pageKey = `${type}${normalizedPage}`;
                    const entryInfo = entries[pageKey];
                    if (entryInfo) {
                        entryInfo.lastActiveTime = Date.now();
                        if (entryInfo.status === BUILT) {
                            resolve();
                            return;
                        }
                        doneCallbacks.once(pageKey, handleCallback);
                        return;
                    }
                    entriesChanged = true;
                    entries[pageKey] = {
                        bundlePath,
                        absolutePagePath,
                        status: ADDED,
                        lastActiveTime: Date.now()
                    };
                    doneCallbacks.once(pageKey, handleCallback);
                    function handleCallback(err) {
                        if (err) return reject(err);
                        resolve();
                    }
                });
            };
            const promise = isApiRoute ? addPageEntry('server') : clientOnly ? addPageEntry('client') : Promise.all([
                addPageEntry('client'),
                addPageEntry('server')
            ]);
            if (entriesChanged) {
                Log.event(isApiRoute ? `build page: ${normalizedPage} (server only)` : clientOnly ? `build page: ${normalizedPage} (client only)` : `build page: ${normalizedPage}`);
                invalidator.invalidate();
            }
            return promise;
        },
        middleware (req, res, next) {
            var ref;
            if (!((ref = req.url) === null || ref === void 0 ? void 0 : ref.startsWith('/_next/webpack-hmr'))) return next();
            const { query  } = (0, _url).parse(req.url, true);
            const page = query.page;
            if (!page) return next();
            const runPing = ()=>{
                const data = handlePing(query.page);
                if (!data) return;
                res.write('data: ' + JSON.stringify(data) + '\n\n');
            };
            const pingInterval = setInterval(()=>runPing()
            , 5000);
            req.on('close', ()=>{
                clearInterval(pingInterval);
            });
            next();
        }
    };
}
function disposeInactiveEntries(_watcher, lastClientAccessPages, maxInactiveAge) {
    const disposingPages = [];
    Object.keys(entries).forEach((page)=>{
        const { lastActiveTime , status  } = entries[page];
        // This means this entry is currently building or just added
        // We don't need to dispose those entries.
        if (status !== BUILT) return;
        // We should not build the last accessed page even we didn't get any pings
        // Sometimes, it's possible our XHR ping to wait before completing other requests.
        // In that case, we should not dispose the current viewing page
        if (lastClientAccessPages.includes(page)) return;
        if (lastActiveTime && Date.now() - lastActiveTime > maxInactiveAge) {
            disposingPages.push(page);
        }
    });
    if (disposingPages.length > 0) {
        disposingPages.forEach((page)=>{
            delete entries[page];
        });
    // disposing inactive page(s)
    // watcher.invalidate()
    }
}
// Make sure only one invalidation happens at a time
// Otherwise, webpack hash gets changed and it'll force the client to reload.
class Invalidator {
    constructor(watcher, multiCompiler){
        this.multiCompiler = multiCompiler;
        this.watcher = watcher;
        // contains an array of types of compilers currently building
        this.building = false;
        this.rebuildAgain = false;
    }
    invalidate() {
        // If there's a current build is processing, we won't abort it by invalidating.
        // (If aborted, it'll cause a client side hard reload)
        // But let it to invalidate just after the completion.
        // So, it can re-build the queued pages at once.
        if (this.building) {
            this.rebuildAgain = true;
            return;
        }
        this.building = true;
        if (!_webpack.isWebpack5) {
            // Work around a bug in webpack, calling `invalidate` on Watching.js
            // doesn't trigger the invalid call used to keep track of the `.done` hook on multiCompiler
            for (const compiler of this.multiCompiler.compilers){
                compiler.hooks.invalid.call();
            }
        }
        this.watcher.invalidate();
    }
    startBuilding() {
        this.building = true;
    }
    doneBuilding() {
        this.building = false;
        if (this.rebuildAgain) {
            this.rebuildAgain = false;
            this.invalidate();
        }
    }
}

//# sourceMappingURL=on-demand-entry-handler.js.map