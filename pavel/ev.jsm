
Components.utils.import("resource://gre/modules/ctypes.jsm");

var EXPORTED_SYMBOLS = ['ev_default_loop', 'callback_t', 'new_timer', 'ev_run'];

let stdc = ctypes.open(ctypes.libraryName("stdc++"));
let ev = ctypes.open(ctypes.libraryName("ev"));
let evwrap = ctypes.open(ctypes.libraryName("evwrap"));


let ev_loop_p = new ctypes.StructType("ev_loop").ptr;
let ev_timer_p = new ctypes.StructType("ev_timer").ptr;
let ev_io_p = new ctypes.StructType("ev_io").ptr;
let callback_t = new ctypes.FunctionType(
    ctypes.default_abi, ctypes.void_t,
    [ev_loop_p, ev_timer_p, ctypes.int]).ptr;

let sleep = ev.declare(
    "ev_sleep", ctypes.default_abi, ctypes.void_t,
    ctypes.double);
let ev_default_loop = ev.declare(
    "ev_default_loop", ctypes.default_abi, ev_loop_p,
    ctypes.unsigned);
let ev_run = ev.declare(
    "ev_run", ctypes.default_abi, ctypes.void_t,
    ev_loop_p, ctypes.int);
let new_timer = evwrap.declare(
    "new_timer", ctypes.default_abi, ev_timer_p,
    ev_loop_p, callback_t, ctypes.double);
let free_io = evwrap.declare(
    "free_timer", ctypes.default_abi, ctypes.void_t,
    ev_io_p);


function callback(foo, bar, baz) {
    consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(
    Components.interfaces.nsIConsoleService);
    consoleService.logStringMessage("ASDFASDFASDFADSF");
}

//let loop = ev_default_loop(0);
//var cb = callback_t(callback);
//var foo = new_timer(loop, cb, 10.0);
//ev_run(loop, 0);


//let loop = ev_default_loop(0);

//let cb_t = new ctypes.FunctionType(
//    ctypes.default_abi, ctypes.void_t).ptr;

//let simple_callback = evwrap.declare(
//    "simple_callback", ctypes.default_abi, ctypes.void_t, cb_t);

/*var workerFactory = Components.classes["@mozilla.org/threads/workerfactory;1"].createInstance(
    Components.interfaces.nsIWorkerFactory);
//var worker = workerFactory.newChromeWorker();

*/