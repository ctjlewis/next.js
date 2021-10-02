"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.pathify = pathify;
exports.instantiateEmscriptenWasm = instantiateEmscriptenWasm;
var _url = require("url");
function pathify(path) {
    if (path.startsWith('file://')) {
        path = (0, _url).fileURLToPath(path);
    }
    return path;
}
function instantiateEmscriptenWasm(factory, path) {
    return factory({
        locateFile () {
            return pathify(path);
        }
    });
}

//# sourceMappingURL=emscripten-utils.js.map