'use strict';

let top = null;

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
        //console.log(name);
        const stack = {}
        stack.parent = top;
        Error.captureStackTrace(stack, patched);
        if (typeof pos == 'number') {
            const fnPos = pos >= 0 ? pos : arguments.length - pos;
            arguments[fnPos] = patchCallback(arguments[fnPos], stack, name);
            if (typeof pos2 !== 'undefined') {
                const fnPos2 = pos2 >= 0 ? pos2 : arguments.length - pos2;
                arguments[fnPos2] = patchCallback(arguments[fnPos2], stack, name);
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
        Error.captureStackTrace(stack, Patched);
        return new Orig(patchCallback(arg, stack, name));
    }

    Object.getOwnPropertyNames(Promise).forEach(prop => {
        if (prop !== 'name' && prop !== 'length') {
            Patched[prop] = Orig[prop];
        }
    });
    obj[name] = Patched;
}

function patchError() {
    const OrigError = Error;
    global.Error = function (message) {
        const result = new OrigError(message);
        let _top = top;
        let stack = result.stack.split('\n');
        while (_top) {
            stack = mergeStack(stack, _top.stack.split('\n').slice(1));
            _top = _top.parent;
        }
        result.stack = stack.join('\n')
            .replace(/ +at.*?\/deepstack\/index.js.*?\n/g, '');
        return result;
    }
    Error.captureStackTrace = OrigError.captureStackTrace;
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



