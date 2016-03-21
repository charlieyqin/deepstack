'use strict';

let top = null;
const OrigError = Error;
const origCapture = Error.captureStackTrace;

function patchCallback(callback, stack, name) {
    return function () {
        const _top = top;
        top = stack;
        try {
            const result = callback.apply(this, arguments);
            top = _top;
            return result;
        } catch (err) {
            top = _top;
            throw err;
        }
    }
}
function patchMethod(obj, name, pos, pos2) {
    const fn = obj[name];
    if (typeof fn !== 'function') {
        throw new Error('Incorrect function');
    }
    obj[name] = function patched() {
        const stack = {}
        stack.parent = top;
        origCapture(stack, patched);
        if (typeof pos == 'number') {
            const fnPos = pos >= 0 ? pos : arguments.length + pos;
            if (typeof arguments[fnPos] == 'function'){
                arguments[fnPos] = patchCallback(arguments[fnPos], stack, name);
            }
            if (typeof pos2 !== 'undefined') {
                const fnPos2 = pos2 >= 0 ? pos2 : arguments.length + pos2;
                if (typeof fnPos2 == 'function') {
                    arguments[fnPos2] = patchCallback(arguments[fnPos2], stack, name);
                }
            }
            return fn.apply(this, arguments);
        } else if (typeof pos == 'function') {
            return pos(this, fn, arguments, stack, name);
        }
    }
}

function patchCtor(obj, name) {
    const Orig = obj[name];

    function Patched(arg) {
        const stack = {};
        stack.parent = top;
        origCapture(stack, Patched);
        return new Orig(patchCallback(arg, stack, name));
    }

    Object.getOwnPropertyNames(Orig).forEach(prop => {
        if (prop !== 'name' && prop !== 'length') {
            Patched[prop] = Orig[prop];
        }
    });
    obj[name] = Patched;
}


function prepareStack(resultStack) {
    let _top = top;
    let stack = resultStack.split('\n');
    while (_top) {
        stack = mergeStack(stack, _top.stack.split('\n').slice(1));
        _top = _top.parent;
    }
    return stack.join('\n')
        .replace(/ +at.*?\/deepstack\/index.js.*?\n/g, '');

}

function patchError() {
    global.Error = function (message) {
        const result = new OrigError(message);
        result.stack = prepareStack(result.stack);
        return result;
    }
    Error.captureStackTrace = function(obj, fn){
        origCapture(obj, fn);
        var stack = obj.stack;
        if (typeof stack == 'string') {
            obj.stack = prepareStack(stack);
        }
    }
    Error.__defineGetter__('stackTraceLimit', () => OrigError.stackTraceLimit);
    Error.__defineSetter__('stackTraceLimit', val => OrigError.stackTraceLimit = val);
    Error.__defineGetter__('prepareStackTrace', () => OrigError.prepareStackTrace);
    Error.__defineSetter__('prepareStackTrace', val => OrigError.prepareStackTrace = val);
}

function mergeStack(a, b) {
    let result;
    let j = 0;
    const divider = '-----------';
    for (let i = 0; i < a.length; i++) {
        let found = true;
        for (let k = i; k < a.length; k++) {
            if (a[k] != b[j]) {
                j = 0;
                found = false;
                break;
            }
            j++;
        }
        if (found) {
            result = a.concat([divider], b.slice(a.length - i));
            break;
        }
    }
    if (!result) {
        result = a.concat([divider], b);
    }
    return result;
}

module.exports = {
    patchMethod: patchMethod,
    patchCtor: patchCtor,
    patchCallback: patchCallback
}

patchError();
patchMethod(global, 'setTimeout', 0);
patchMethod(global, 'setInterval', 0);
patchMethod(global, 'setImmediate', 0);
patchMethod(process, 'nextTick', 0);

patchCtor(global, 'Promise');
patchMethod(Promise.prototype, 'then', 0, 1);
patchMethod(Promise.prototype, 'catch', 0);


// patch bluebird
var cache = module.constructor._cache;
for (var i in cache) {
    var bluebird = cache[i].exports;
    if (i.indexOf('/bluebird/js/main/bluebird.js') > -1){
        patchCtor(cache[i], 'exports');
        patchMethod(bluebird.prototype, 'then', 0, 1);
        patchMethod(bluebird.prototype, 'catch', 0);
        patchMethod(bluebird.prototype, 'finally', 0);
    }
}


