
"use strict";

let stdlib = ctypes.open(ctypes.libraryName("stdc++"));
let pollfd = ctypes.StructType("pollfd",
    [{fd: ctypes.int},
    {events: ctypes.short},
    {revents: ctypes.short}]);

let pavel = (function pavel() {
    // *************************************************************
    // Actor
    function Actor(sched, main) {
        let actor = this;
        let sandbox = evalcx("");
        sandbox._script = '(' + main.toString() + '())';
        evalcx(read("actormain.js"), sandbox);
        sandbox.print = print;
        this._sandbox = sandbox;
    }
    Actor.prototype = {
        toString: function() {
            return "[object Actor(" + this._sandbox._script + ")]";
        },
        ready: function(sched) {
            try {
                let event = evalcx("resume()", this._sandbox);
                if (event && event.length == 2) {
                    let [msg, data] = event;
                    if (msg === "wait") {
                        sched.timer(data, this);
                    } else if (msg === "msg") {
                        // Just wait until someone puts an appropriate message
                        // in our mailbox and schedules us.
                        //print("Waiting for", data);
                    } else if (msg === "") {
                    } else {
                        print("unhandled message", msg, data);
                    }
                }
            } catch (e) {
                if (e instanceof StopIteration) return;
                print("Error in Actor:", e, e.stack);
            }
        }

    }

    // *************************************************************
    // Address
    function Address(actor, scheduler) {
        this._actor = actor;
        this._scheduler = scheduler;
    }
    Address.prototype = {
        toString: function() { return "[object Address]"; },
        cast: function(pattern, message) {
            if (!message instanceof Address) {
                JSON.stringify(message)
            }
            this._actor._sandbox._mailbox.push([pattern.toString(), message]);
            this._scheduler.schedule(this._actor);
        }
    }

    // *************************************************************
    // Pavel
    function Pavel() {
        this.readies = [];
        this.timers = [];
        this.waiters = [];
        this._poll = stdlib.declare("poll", ctypes.default_abi, ctypes.int,
            pollfd.ptr, ctypes.int, ctypes.int);
    }
    Pavel.prototype = {
        schedule: function(actor) {
            if (actor) {
                this.readies.push(actor);
            }
        },
        timer: function(time, actor) {
            this.timers.push([time, actor]);
            this.timers.sort(function(a, b) {
                return ((a[0] < b[0]) ? -1 : ((a[0] > b[0]) ? 1 : 0));
            });
        },
        sleep: function(timeout) {
            let waiters = [];
            for (let i = 0, l = this.waiters.length; i < l; i++) {
                let wait = this.waiters[i];
                waiters.push({
                    fd: wait._fd,
                    events: (wait._send ? POLLOUT : 0) + (wait._recv ? POLLIN : 0),
                    revents: 0});
            }
            let fd_array = 0;
            let length = 0;
            if (waiters.length) {
                let fd_array_t = pollfd.array(waiters.length);
                fd_array = new fd_array_t(waiters);
                length = waiters.length;
            } else {
                fd_array = pollfd.array(0)();
            }
            // ****************************************
            this._poll(fd_array, waiters.length, timeout);
            // ****************************************
            let new_waiters = [];
            for (let i = 0, l = waiters.length; i < l; i++) {
                if (fd_array[i].revents) {
                    this.schedule(this._waiters[i]);
                } else {
                    new_waiters.push(this._waiters[i]);
                }
            }
            this.waiters = new_waiters;
        },
        spawn: function(main) {
            let actor = new Actor(this, main);
            this.schedule(actor);
            return new Address(actor, this);
        },
        drain: function(timeout) {
            while (this.readies.length || this.timers.length) {
                while (this.readies.length) {
                    let evt = this.readies.shift();
                    if (evt.ready) {
                        evt.ready(this);
                    } else {
                        throw new Error("Invalid event: " + evt.toString() + " " + Object.keys(evt));
                    }
                }
                let now = new Date();
                for (var i = 0, l = this.timers.length; i < l; i++) {
                    if (now < this.timers[i][0]) {
                        break;
                    }
                }
                let timers = this.timers.splice(0, i);
                while (timers.length) {
                    let timer = timers.shift();
                    this.schedule(timer[1]);
                }
                if (!this.readies.length && (this.timers.length || this.waiters.length)) {
                    let sleepTime = 30;
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
});

let act2 = pavel.spawn(function main() {
    let peer = yield receive("peer");
    peer.cast("message", "bar");
    let message = yield receive("message");
    print("Act2 saw: " + message);
    peer.cast("message", "frotz");
    message = yield receive("message");
    print("Act2 saw: " + message);
});

act1.cast("peer", act2);
act2.cast("peer", act1);

pavel.drain();












/*let act1 = pavel.spawn(function main() {
    for (let i = 0; i < 20; i++) {
        print("hi!");
        yield wait(333);
    }
});
let act1 = pavel.spawn(function main() {
    for (let i = 0; i < 25; i++) {
        print("bye!");
        yield wait(222);
    }
});*/