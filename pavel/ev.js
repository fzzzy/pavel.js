
let stdc = ctypes.open(ctypes.libraryName("stdc++"));
let ev = ctypes.open(ctypes.libraryName("ev"));
let evwrap = ctypes.open(ctypes.libraryName("evwrap"));
print(evwrap);
var symbols = read("../Symbols.ev").split('\n');
symbols.forEach(function(d) {
    try {
        ev.declare(
            d, ctypes.default_abi, ctypes.void_t);
    } catch (e) {
        print(d);
    }
});


/*
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

let loop = ev_default_loop(0);
function callback() {
    print("hiho");
}

let cb_t = new ctypes.FunctionType(
    ctypes.default_abi, ctypes.void_t).ptr;

print(cb_t);

let simple_callback = evwrap.declare(
    "simple_callback", ctypes.default_abi, ctypes.void_t, cb_t);
print("asdf");
let cb = cb_t(callback);
print("asdfw");
cb();
print("dasczxv");
simple_callback(cb);
print("qwer");
//var cb = callback_t(callback);
//print(cb);
//var foo = new_timer(loop, cb, 1.0);
//print("RUN!");
//print (cb);
//ev_run(loop, 0);
//print("RAN");
*/