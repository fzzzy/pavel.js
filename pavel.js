
"use strict";

let pavel = (function pavel() {
    let main_loop = null;
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
    Wait.prototype = {
        toString: function toString() {
            return ("[object Wait(" + this._fd + ", " +
                this._recv ? "recv" : this._send ? "send" : ""
                + ", " + this._data + ")]") }
    }

    // *************************************************************
    // Actor
    function Actor(sched, main) {
        let actor = this;
        let sandbox = evalcx("lazy");

        this._sandbox = sandbox;
        this._sockets = {};

        print("Spawning", main);
        function Marker() {}
        sandbox._sentinel = new Marker();
        sandbox.print = print;
        evalcx(read("../dom.js/dom.js"), sandbox);
        sandbox.document.write = function(j) {
            // TODO
        };
        sandbox.document.location = { href: "http://example.com/foo" };
        sandbox.window = {};
        sandbox.spawn = function(module) {
            return main_loop.spawn(module);
        };
        sandbox.socket_connect = function connect(host, port) {
            let sock = socket.connect(host, port);
            actor._sockets[sock._fd] = sock;
            //actor._cast("connect", [sock._fd, data[2]]);
            return sock._fd;
        };
        sandbox.socket_close = function close(fileno) {
            actor._sockets[fileno].close();
            delete actor._sockets[fileno];
            actor._cast("close", fileno);
        };
        sandbox.schedule_timer = function schedule_timer(timeout, request_id) {
            let until = new Date().getTime() + timeout;
            sched.timer(actor, until, request_id);
        };
        sandbox.schedule_read = function schedule_read(fd, howmuch, request_id) {
            sched.iowait(actor, fd, true, false, [howmuch, request_id]);
        };
        sandbox.schedule_write = function schedule_write(fd, data, request_id) {
            sched.iowait(actor, fd, false, true, [data, request_id]);
        };
        evalcx("function _main() {" + read(main) + '\nyield _sentinel; };', sandbox);
        evalcx(read("actormain.js"), sandbox);
        evalcx(read("parser.js"), sandbox);
        evalcx("let event = document.createEvent('customevent'); event.initEvent('DOMContentLoaded', false, true); document.dispatchEvent(event);", sandbox);
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
        },
        _resume: function _resume() {
            evalcx("resume()", this._sandbox);
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
        this.runnable = [];
        this.waiters = {};

        this.pollfd = ctypes.StructType("pollfd",
            [{fd: ctypes.int},
            {events: ctypes.short},
            {revents: ctypes.short}]);
        this.null_fd_array = this.pollfd.array(0)();
        this._poll = ctypes.open(
            ctypes.libraryName("stdc++")
        ).declare("poll", ctypes.default_abi, ctypes.int,
            this.pollfd.ptr, ctypes.int, ctypes.int);
    }
    Pavel.prototype = {
        toString: function() {
            return "[object Pavel]";
        },
        timer: function timer(actor, time, extra) {
            this.timers.push([time, actor, extra]);
            this.timers.sort(function(a, b) {
                return ((a[0] < b[0]) ? -1 : ((a[0] > b[0]) ? 1 : 0));
            });
        },
        iowait: function iowait(actor, fd, read, write, data) {
            this.waiters[fd] = new Wait(actor, fd, read, write, data);
        },
        _gen_poll_list: function _gen_poll_list() {
            let wait_list = [];
            for (var i in this.waiters) {
                let wait = this.waiters[i];
                let evt = ((wait._send ? socket.POLLOUT : 0) + (wait._recv ? socket.POLLIN : 0))
                wait_list.push({fd: wait._fd, events: evt, revents: 0});
            }
            if (wait_list.length) {
                let fd_array_t = this.pollfd.array(wait_list.length);
                return new fd_array_t(wait_list);
            }
            return this.null_fd_array;
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
                        let result = sock.recv(waiter._data[0]);
                        actor._cast('recv', [evt.fd, result, waiter._data[1]]);
                    } else if (waiter._send) {
                        let bytes_sent = sock.send(waiter._data[0]);
                        actor._cast('send', [evt.fd, bytes_sent, waiter._data[1]]);
                    }
                }
            }
        },
        spawn: function spawn(main) {
            let actor = new Actor(this, main);
            this.runnable.push(actor);
            return new Address(actor);
        },
        drain: function drain(timeout) {
            while (this.runnable.length || this.timers.length || Object.keys(this.waiters).length) {
                let runnable = this.runnable;
                this.runnable = [];
                let i = 0, l = runnable.length;
                for ( ; i < l; i++) {
                    runnable[i]._resume();
                }
                if (this.timers.length || Object.keys(this.waiters).length) {
                    let sleepTime = 3000;
                    if (this.timers.length) {
                        sleepTime = Math.floor(this.timers[0][0] - new Date().getTime());
                    }
                    this.sleep(sleepTime);
                }
                let now = new Date().getTime();
                for (i = 0, l = this.timers.length ; i < l; i++) {
                    if (now < this.timers[i][0]) {
                        break;
                    }
                }
                let timers = this.timers.splice(0, i);
                while (timers.length) {
                    let timer = timers.shift();
                    let actor = timer[1];
                    actor._cast("wait", timer[2]);
                }
            }
        }
    }
    main_loop = new Pavel();
    return main_loop;
}());


