
"use strict";

let stdlib = ctypes.open(ctypes.libraryName("stdc++"));
let pollfd = ctypes.StructType("pollfd",
    [{fd: ctypes.int},
    {events: ctypes.short},
    {revents: ctypes.short}]);

let pavel = (function pavel() {
    let socket = evalcx("lazy");
    socket.ctypes = ctypes;
    evalcx(read("socket.js"), socket);

    function Wait(actor, fd, recv, send, data) {
        this._actor = actor;
        this._fd = fd;
        this._recv = recv;
        this._send = send;
        this._data = data;
    }

    // *************************************************************
    // Actor
    function Actor(sched, main) {
        let actor = this;
        let sandbox = evalcx("lazy");

        this._sandbox = sandbox;
        this._sockets = {};

        sandbox._script = '(' + main.toString() + '())';
        evalcx(read("actormain.js"), sandbox);
        sandbox.print = print;
        sandbox._schedule_event = function(msg, data) {
            if (msg === "wait") {
                sched.timer(actor, data);
            } else if (msg === "msg") {
                // do nothing, waiting for a message
            } else if (msg === "connect") {
                let sock = socket.connect(data[0], data[1]);
                actor._sockets[sock._fd] = sock;
                actor._cast("connect", sock._fd);
            } else if (msg === "send") {
                sched.iowait(actor, data[0], false, true, data[1]);
            } else if (msg === "recv") {
                sched.iowait(actor, data[0], true, false, data[1]);
            } else if (msg === "close") {
                actor._sockets[data[0]].close();
                delete actor._sockets[data[0]];
                actor._cast("close", data[0]);
            } else {
                print("unhandled message", msg, data);
            }
        }
    }
    Actor.prototype = {
        toString: function toString() {
            //return "[object Actor(" + this._sandbox._script + ")]";
            return "[object Actor(...)]";
        },
        _cast: function _cast(pattern, msg) {
            if (msg instanceof Address) {
                this._sandbox._address = msg;
                msg = "_address";
            } else {
                msg = JSON.stringify(msg);
            }
            let evalstr = "cast('" + pattern.toString() + "', " + msg + ");";
            evalcx(evalstr, this._sandbox);
            delete this._sandbox._address;
        }
    }

    // *************************************************************
    // Address
    function Address(actor) {
        this.cast = function cast(pattern, message) { actor._cast(pattern, message) };
    }
    Address.prototype = {
        toString: function toString() { return "[object Address]"; },
    }

    // *************************************************************
    // Pavel
    function Pavel() {
        this.timers = [];
        this.waiters = {};
        this._poll = stdlib.declare("poll", ctypes.default_abi, ctypes.int,
            pollfd.ptr, ctypes.int, ctypes.int);
    }
    Pavel.prototype = {
        toString: function() {
            return "[object Pavel]";
        },
        timer: function timer(actor, time) {
            this.timers.push([time, actor]);
            this.timers.sort(function(a, b) {
                return ((a[0] < b[0]) ? -1 : ((a[0] > b[0]) ? 1 : 0));
            });
        },
        iowait: function iowait(actor, fd, read, write, data) {
            this.waiters[fd] = new Wait(actor, fd, read, write, data);
        },
        _gen_poll_list: function _gen_poll_list() {
            let waiters = [];
            for (var i in this.waiters) {
                let wait = this.waiters[i];
                waiters.push({
                    fd: wait._fd,
                    events: (
                        (wait._send ? socket.POLLOUT : 0) +
                        (wait._recv ? socket.POLLIN : 0)),
                    revents: 0});
            }
            let fd_array = null;
            let length = 0;
            if (waiters.length) {
                let fd_array_t = pollfd.array(waiters.length);
                fd_array = new fd_array_t(waiters);
                length = waiters.length;
            } else {
                fd_array = pollfd.array(0)();
            }
            return fd_array;
        },
        sleep: function sleep(timeout) {
            let fd_array = this._gen_poll_list();
            // ****************************************
            this._poll(fd_array, fd_array.length, timeout);
            // ****************************************
            for (let i = 0, l = fd_array.length; i < l; i++) {
                let evt = fd_array[i];
                if (evt.revents) {	
                    let waiter = this.waiters[evt.fd];
                    delete this.waiters[evt.fd];
                    let actor = waiter._actor;
                    let sock = actor._sockets[evt.fd];
                    if (waiter._recv) {
                        let result = sock.recv(waiter._data);
                        actor._cast('recv', [evt.fd, result]);
                    } else if (waiter._send) {
                        let bytes_sent = sock.send(waiter._data);
                        actor._cast('send', [evt.fd, bytes_sent]);
                    }
                }
            }
        },
        spawn: function spawn(main) {
            let actor = new Actor(this, main.toString());
            actor._cast("spawn", true);
            return new Address(actor);
        },
        drain: function drain(timeout) {
            while (this.timers.length || Object.keys(this.waiters).length) {
                let now = new Date();
                for (var i = 0, l = this.timers.length; i < l; i++) {
                    if (now < this.timers[i][0]) {
                        break;
                    }
                }
                let timers = this.timers.splice(0, i);
                while (timers.length) {
                    let timer = timers.shift();
                    let actor = timer[1];
                    actor._cast("wait", timer[0]);
                }
                if (this.timers.length || Object.keys(this.waiters).length) {
                    let sleepTime = 3000;
                    if (this.timers.length) {
                        sleepTime = (this.timers[0][0].getTime() - new Date().getTime());
                    }
                    this.sleep(sleepTime);
                }
            }
        }
    }
    return new Pavel();
}());


let act1 = pavel.spawn(function main() {
    let peer = yield receive("peer");
    peer.cast("message", "foo");
    let message = yield receive("message");
    print("Act1 saw: " + message);
    peer.cast("message", "baz");
    message = yield receive("message");
    print("Act1 saw: " + message);
    peer.cast("message", "foom");
    message = yield receive("message");
    print("Act1 saw: " + message);
});

let act2 = pavel.spawn(function main() {
    let peer = yield receive("peer");
    peer.cast("message", "bar");
    let message = yield receive("message");
    print("Act2 saw: " + message);
    peer.cast("message", "frotz");
    message = yield receive("message");
    print("Act2 saw: " + message);
    peer.cast("message", "xyzzy");
    message = yield receive("message");
    print("Act2 saw: " + message);
});

act2.cast("peer", act1);
act1.cast("peer", act2);


let act3 = pavel.spawn(function main() {
    print(":::: start");
    let sock = yield connect("localhost", 6000);
    print(":::: we connected", sock, Object.keys(sock));
    yield sock.send("hello");
    print(":::: we sent");
    let got = yield sock.recv(32);
    print(":::: we got", got);
    yield sock.close();
    print(":::: we closed");
});


let act4 = pavel.spawn(function main() {
    for (let i = 0; i < 7; i++) {
        print("hi!");
        yield wait(333);
    }
});
let act5 = pavel.spawn(function main() {
    for (let i = 0; i < 13; i++) {
        print("bye!");
        yield wait(222);
    }
});


pavel.drain();












