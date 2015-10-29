/*jshint node:true */

var Module = require('module');
var path = require('path');
var needles = {};
var reFn = /^(?:([^\.\[\(\s]+)(?:\.+([^\.\[\(\s]+))*)?(?:\s*\[as\s*([^\]]+)\])?$/;
var reEval = /^(?:eval |\s*)?at (?:(new )?((?:\((?!eval at )|[^\(])+) \()?(?:native|null|(?:(.+), )?(.+):(\d+):(\d+))\)?$/;
var relPaths = Module.globalPaths.slice(0);

relPaths.push(process.cwd());
if (require.main) {
    relPaths.push(path.dirname(require.main.filename));
}
relPaths.sort(function (x, y) {
    return y.length - x.length;
});

function define(obj, prop, value) {
    Object.defineProperty(obj, prop, {
        value: value,
        configurable: true
    });
}

function copy(dst, src) {
    for (var i in src) {
        dst[i] = src[i];
    }
    return dst;
}

function repeat(c, len) {
    return Array.prototype.join.call({
        length: len + 1
    }, c);
}

function prepRawFrames(str) {
    return str.split('\n').slice(1, -1).map(function (v) {
        return {
            rawString: v
        };
    });
}

function splatNeedles(source) {
    var arr = [];
    source.forEach(function (v) {
        arr.unshift(arr[0] ? arr[0] + '/' + v : v);
    });
    return arr;
}

function subpath(to) {
    for (var i in relPaths) {
        var p = path.relative(relPaths[i], to);
        if (p.substr(0, 3) !== '..' + path.sep && p.substr(0, 3) !== to.substr(0, 3)) {
            return p;
        }
    }
}

function computeNeedles(filename) {
    filename = filename || '';
    return needles[filename] || (function () {
        var arr = filename.split(path.sep);
        var idx = arr.lastIndexOf('node_modules') + 1;
        var rel = idx || subpath(filename);
        if (arr.length === 1) {
            needles[filename] = [filename];
        } else if (idx) {
            needles[filename] = splatNeedles(arr.slice(idx));
        } else if (rel) {
            needles[filename] = splatNeedles(rel.split(path.sep));
        } else {
            needles[filename] = [];
        }
        return needles[filename];
    }());
}

function isBlackBoxed(filename, arr) {
    var needles = computeNeedles(filename);
    return needles.some(function (v) {
        return arr.indexOf(v) >= 0;
    });
}

function normalizeFunctionName(f, t) {
    // V8 gives functions in object literals and named function assigned elsewhere
    // as namespaced '$.extend.myFunction' or aliased 'Class.method [as anotherName]'
    // use the resolved name or strip the namespaces because if there was a name the name should be verbose enough
    f = (reFn.test(f), (RegExp.$3 || RegExp.$2 || RegExp.$1 || ''));
    if (f === '<anonymous>') {
        f = '';
    }

    // choose the outermost namespace as the type name if any
    // if type name is 'Object' check whether the function belongs to Object or Object.prototype
    // it is so often a function is passed by an object literal and that would resolve as Object.functionName
    // replace Object with a question mark (?) to indicate an anonymous object literal
    t = t || (RegExp.$2 ? RegExp.$1 : '');
    if (t === 'Object' && (!Object[f] || !Object.prototype[f])) {
        t = '?';
    }
    return (t && f && (t + '.')) + f;
}

function captureV8StackTrace(belowFn, skipFrame) {
    var oldLimit = Error.stackTraceLimit;
    var v8Handler = Error.prepareStackTrace;
    try {
        var dummyObject = {};
        Error.stackTraceLimit = Infinity;
        Error.prepareStackTrace = function (obj, st) {
            return st;
        };
        Error.captureStackTrace(dummyObject, belowFn || captureV8StackTrace);
        return dummyObject.stack.slice(skipFrame || 0);
    } finally {
        Error.prepareStackTrace = v8Handler;
        Error.stackTraceLimit = oldLimit;
    }
}

function prepAsyncStack(skipFrame) {
    var st = new Error();
    var async;
    setImmediate(function () {
        async = true;
    });
    return function (err) {
        if (err && async) {
            err.asyncStack = err.asyncStack || (function (arr) {
                arr.splice(1, +skipFrame || 0);
                return arr.join('\n');
            }(st.stack.split('\n')));
        }
        return err;
    };
}

function StackTrace(frames, options) {
    var asyncOrigin;
    define(this, '_options', options);
    Array.prototype.push.apply(this, frames.map(function (v) {
        return new StackFrame(v, options);
    }).filter(function (v) {
        asyncOrigin = v.asyncOrigin;
        return !Array.isArray(options.blackbox) || !isBlackBoxed(v.filePath, options.blackbox);
    }));
    if (asyncOrigin) {
        this[this.length - 1].asyncOrigin = asyncOrigin;
    }
}
StackTrace.prototype = Object.create(Array.prototype);
StackTrace.prototype.toString = function () {
    return this._options.formatter.formatTrace(this, this._options);
};

function StackFrame(input, options) {
    if (input.rawString || typeof input === 'string') {
        this.rawString = input.rawString || input;
        if (reEval.test(input.rawString || input)) {
            var fn = RegExp.$2;
            var posDot = fn.indexOf('.');
            define(this, '_evalOrigin', RegExp.$3 || null);
            copy(this, {
                native: !RegExp.$4,
                isConstructor: !!RegExp.$1,
                typeName: posDot > 0 ? fn.substr(0, posDot) : '',
                rawFunctionName: fn.substr(posDot + 1),
                filePath: RegExp.$4 || null,
                lineNumber: RegExp.$5 || null,
                columnNumber: RegExp.$6 || null
            });
        }
    } else {
        var thisArg = input.getThis();
        define(this, '_evalOrigin', input.isEval() ? input.getEvalOrigin() : null);
        copy(this, {
            rawString: input.toString(),
            native: input.isNative(),
            isConstructor: input.isConstructor(),
            typeName: (thisArg !== undefined && thisArg !== null && input.getTypeName()) || '',
            rawFunctionName: input.getFunctionName() || '',
            filePath: input.isNative() ? null : input.getFileName() || '<anonymous>',
            lineNumber: input.getLineNumber() || null,
            columnNumber: input.getColumnNumber() || null
        });
    }
    if (input.asyncOrigin) {
        this.asyncOrigin = new StackTrace(input.asyncOrigin, options);
    }
    this.fileName = (!options.showFullPath && computeNeedles(this.filePath)[0]) || this.filePath;
    define(this, '_options', options);
}
StackFrame.prototype = {
    get evalOrigin() {
        if (typeof this._evalOrigin === 'string') {
            define(this, '_evalOrigin', new StackFrame(this._evalOrigin, this._options));
        }
        return this._evalOrigin;
    },
    get functionName() {
        if (!this.hasOwnProperty('_functionName')) {
            var functionName = (this._options.showRawFunctionName ? (this.typeName && this.typeName + '.') + this.rawFunctionName :
                normalizeFunctionName(this.rawFunctionName, this.typeName) ||
                this._options.anonString ||
                this._options.formatter.anonString || '');
            define(this, '_functionName', (this.isConstructor && 'new ' || '') + functionName);
        }
        return this._functionName;
    },
    get source() {
        if (!this.hasOwnProperty('_source')) {
            var formatter = this._options.formatter;
            var str = formatter.formatSource(this, this._options);
            if (this._options.showEvalOrigin && this.evalOrigin) {
                str += formatter.formatEvalOrigin(this.evalOrigin, this._options);
            }
            define(this, '_source', str);
        }
        return this._source;
    },
    toString: function () {
        if (!this.hasOwnProperty('_string')) {
            var formatter = this._options.formatter;
            var str = this._options.indent + formatter.formatFrame(this, this._options);
            if (this._options.showAsyncOrigin && this.asyncOrigin) {
                str += formatter.formatAsyncOrigin(this.asyncOrigin, this._options);
            }
            define(this, '_string', str);
        }
        return this._string;
    }
};

function Formatter(options) {
    copy(this, options);
}
Formatter.prototype = {
    anonString: '',
    formatTrace: function (v, options) {
        return v.join('\n');
    },
    formatFrame: function (v, options) {
        return 'at ' + (v.functionName ? v.functionName + ' (' + v.source + ')' : v.source);
    },
    formatSource: function (v, options) {
        return v.native ? 'native' : v.fileName + ':' + v.lineNumber + (options.showColumnNumber ? ':' + v.columnNumber : '');
    },
    formatEvalOrigin: function (v, options) {
        return ' eval at ' + v.source;
    },
    formatAsyncOrigin: function (v, options) {
        return '\n' + options.indent + '[async]\n' + v;
    }
};
Formatter.native = new Formatter();
Formatter.default = new Formatter({
    anonString: '(anonymous function)',
    formatTrace: function (v, options) {
        function getMaxLength(trace) {
            trace.forEach(function (frame) {
                options.fmax = Math.max(frame.functionName.length, options.fmax || 0);
                if (frame.asyncOrigin) {
                    getMaxLength(frame.asyncOrigin);
                }
            });
        }
        getMaxLength(v);
        return Formatter.prototype.formatTrace.apply(this, arguments);
    },
    formatFrame: function (v, options) {
        return v.functionName + repeat(' ', options.fmax - v.functionName.length) + ' @ ' + v.source.replace(/\\/g, '/');
    }
});

module.exports = exports = function traceable(v, options) {
    if (!options && typeof v === 'object' && !v.stack) {
        options = v;
        v = 0;
    }
    options = copy({}, options);
    if (!options.hasOwnProperty('showEvalOrigin')) {
        options.showEvalOrigin = true;
    }
    if (!options.hasOwnProperty('showAsyncOrigin')) {
        options.showAsyncOrigin = true;
    }
    options.formatter = options.formatter || Formatter.default;
    options.indent = isNaN(+options.indent) ? options.indent || '    ' : repeat(' ', options.indent || 1);

    var frames;
    if (v && v.stack) {
        frames = prepRawFrames(v.stack);
        if (v.asyncStack) {
            frames[frames.length - 1].asyncOrigin = prepRawFrames(v.asyncStack);
        }
    } else if (typeof v === 'string') {
        frames = prepRawFrames(v);
    } else if (+v === v) {
        frames = captureV8StackTrace(traceable, v);
    } else {
        frames = captureV8StackTrace(v || traceable);
    }
    return new StackTrace(frames, options);
};

exports.Formatter = Formatter;
exports.trace = exports;
exports.prepAsyncStack = prepAsyncStack;
