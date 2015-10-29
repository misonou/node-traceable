# traceable

Capture, parse and format V8 stack trace.

## Installation

```
npm install traceable
```

## Usage

### traceable([input], [options])

The main function can:
-   Capture and normalize the stack trace from the current invocation
-   Parse stack trace from an `Error` object
-   Recongize `asyncStack` on an `Error` object
-   Format the stack trace

The returned object is an instance of `StackTrace`.

```javascript
var traceable = require('traceable');

// main function is aliased as a property of the module
traceable.trace === traceable;

// get stack trace
traceable();

// get stack trace with top most N frames skipped
traceable(2);

// get stack trace with frames above myFunc skipped
traceable(myFunc);

// get stack trace captured by the Error object
var err = new Error();
traceable(err);

// same as above in case only the stack trace itself is available
var stack = err.stack
traceable(stack);
```

#### Options

Below is an exhausive list of options, with the default value shown.

```javascript
{
    // string prepended to each frame
    // if supplied with number, that number of spaces is prepended
    indent: "    ",

    // hide frames from source files specified (see 'Blackboxing')
    blackbox: [],

    // format the stack trace when StackTrace.toString is called
    formatter: Formatter.default,

    // descriptive label for anonymous function
    anonString: "",

    // show column number
    showColumnNumber: false,

    // show eval site if function is from eval'd code
    showEvalOrigin: true,

    // append async stack trace if any
    showAsyncOrigin: true,

    // show original source file path (see 'Paths to source files')
    showFullPath: false,

    // show original function name (see 'Function names')
    showRawFunctionName: false
}
```

#### Paths to source files

Unless `showFullPath` is set to `true`, paths to source files are stripped as
relative to:
-   the **innermost** `node_modules` folder
-   any of the global module paths
-   directory of the main module
-   process working directory

`/path/to/node_modules/my-mod/node_modules/traceable/traceable.js` is resolved as `traceable/traceable.js`

#### Function names

Unless `showRawFunctionName` is set to `true`, function names are manipulated as follow:

-   function which aliased to another name takes the highest precedence

    `Object.aliasedName` instead of `Object.origName [as aliasedName]`

-   function names resolved with pseudo-namespaces are stripped

    `Object.myFunc` instead of `Object.$.extend.myFunc`

-   if the function is called on an anonymous object (often calling function of an object literal)
    and the function is not defined on `Object.prototype`, the type name is replaced with `?`:

    `?.resolve` instead of `Object.resolve`; while

    `Object.hasOwnProperty` is kept

#### Blackboxing

Blackboxing, similar to the node inspector interface, can hide frames from certain source file
as specified.

Paths can be:
-   names to built-in modules: `fs.js`
-   relative to the **innermost** `node_modules` folder
-   relative to any of the global module paths
-   relative to directory of the main module
-   relative to process working directory

If a path resolves to a folder, all scripts under that folder will be blackboxed.
Thus:

`/path/to/program/node_modules/my-mod/node_modules/nested/util/x.js`
can be blackboxed by one of the following path:
-   `nested/util/x.js`,
-   `nested/util`,
-   `nested`

### traceable.StackTrace

The `StackTrace` object is an `Array`-prototyped object that contains
`StackFrame` objects parsed from the stack trace.

So you can freely work with the parsed stack trace with functions like
`Array.filter` and `Array.forEach` etc.

```javascript
var st = traceable(err);
st.forEach(function (v) {
    // prints the function name of each call site
    console.log(v.functionName);
});
```

### traceable.StackFrame

The `StackFrame` object represent each call site parsed and contains
normalized information about the call site.

```javascript
{
    // formatted string from built-in CallSite.toString()
    rawString: '    at new Object.extend.doSomething (/path/to/my/script.js:50:4)'

    // whether the call site is native
    native: false,

    // whether the call site is called by 'new' operator
    isConstructor: true,

    // type name of 'this' object in the call site
    typeName: 'Object',

    // function name resolved by V8
    rawFunctionName: 'extend.doSomething',

    // full path of the script file
    // null for native call site
    fileName: '/path/to/my/script.js',

    // line number of the call site
    // null for native call site
    lineNumber: 50,

    // column number of the call site
    // null for native call site
    columnNumber: 4,

    // a StackTrace object parsed from the async stack trace
    // if the Error object is prep'd with async stack trace
    // otherwise undefined
    asyncOrigin: <#StackTrace>,

    // a StackFrame object of the eval call site
    // if the call site in a function compiled in eval or new Function
    // otherwise null
    get evalOrigin(),

    // function name
    get functionName(),

    // formatted string of the function location
    // depends on options.formatter
    get source()
}
```

### traceable.Formatter([options])

Provides means to customize the formatted output of the stack trace.

There is two built-in formatters, `default` and `native`.

- `traceable.Formatter.default` (a.k.a inspector style):
```
  (anonymous function) @ /trace-test/anon.js:2
  MyClass.method       @ myclass/myclass.js:210
  dynamic_function     @ <anonymous>:2 eval at myclass/helper.js:50
```

- `traceable.Formatter.native`
```
  at /trace-test/anon.js:2:10
  at MyClass.extend.myMethod (/trace-test/node_modules/myclass/myclass.js:210:4)
  at dynamic_function (eval at /trace-test/node_modules/myclass/helper.js:50:12, <anonymous>:2:4)
```

You can create your own formatter by defining functions
the handle different components of a stack trace.

All options are **optional**, if not specified the `native` style is used.
The second parameter `options` is the options passed to `traceable()`.

Each function should return a string.

```javascript
new traceable.Formatter({
    // format the entire stack trace
    // called by StackTrace.toString
    formatTrace: function (stackTrace, options) { ... },

    // format each call site
    formatFrame: function (stackFrame, options) { ... },

    // format the location of call site
    // called by StackFrame.source
    formatSource: function (stackFrame, options) { ... },

    // format eval site which is appended to the source
    // called by StackFrame.source
    formatEvalOrigin: function (stackFrame, options) { ... },

    // format async marker and the whole async stack trace
    // called by StackFrame.toString
    // see async stack trace example below
    formatAsyncOrigin: function (stackTrace, options) { ... }
})
```

### traceable.prepAsyncStack([skip])

Enable more verbose stack trace in async operation.

Similar to [long-stack-trace](https://www.npmjs.com/package/long-stack-trace)
but instead of wrapping async function such as `setTimeout` and `EventEmitter.on`,
it records the current stack trace and return a prep function.

```javascript
function somethingAsync() {
    var prep = traceable.prepAsyncStack();  // returns a function
    setTimeout(function () {
        var err = new Error();
        // the stack trace captured by prepAsyncStack()
        // is assigned to the Error object
        throw prep(err);
    });
}
process.on('uncaughtException', function(err){
    // recognizes the prep'd async stack
    console.log(traceable(err));
});
```
would output the following to console:
```
    at async.js:6:19
    [async]
    at somethingAsync (async.js:2:16)
    at someOtherFunction (main.js:40:4)
```

#### Options

`skip`: Number of frames to skip

## License

The MIT License (MIT)

Copyright (c) 2015 misonou

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
