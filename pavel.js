
"use strict";

const MAX_FDS = 32;

let pavel = (function pavel() {
    // *************************************************************
    // ctypes
    let stdlib = ctypes.open(ctypes.libraryName("stdc++"));
    let evwrap = ctypes.open(ctypes.libraryName("evwrap"));
    let errno = evwrap.declare("err", ctypes.default_abi, ctypes.int);
    let [POLLIN, POLLPRI, POLLOUT,
        POLLRDNORM, POLLWRNORM,
        POLLRDBAND, POLLWRBAND,
        POLLERR, POLLHUP, POLLNVAL] = [
        1, 2, 4, 0x40, 4, 0x80, 0x100, 8, 0x10, 0x20];

    let socket = stdlib.declare("socket", ctypes.default_abi, ctypes.int,
        ctypes.int, ctypes.int, ctypes.int);
    let htons = stdlib.declare("htons", ctypes.default_abi, ctypes.uint16_t, ctypes.uint16_t);
    let hostent = ctypes.StructType("hostent",
        [{h_name: ctypes.char.ptr},
        {h_aliases: ctypes.char.ptr.ptr},
        {h_addrtype: ctypes.int},
        {h_length: ctypes.int},
        {h_addr_list: ctypes.uint8_t.array(4).ptr.ptr}]);
    let sockaddr_in = ctypes.StructType("sockaddr_in",
        [{sin_family: ctypes.short},
        {sin_port: ctypes.unsigned_short},
        {sin_addr: ctypes.uint8_t.array(4)},
        {sin_zero: ctypes.uint8_t.array(8)}]);
    let gethostbyname = stdlib.declare("gethostbyname", ctypes.default_abi, hostent.ptr,
        ctypes.char.ptr);
    let connect = stdlib.declare("connect", ctypes.default_abi, ctypes.int,
        ctypes.int, sockaddr_in.ptr, ctypes.int);
    let recv = stdlib.declare("recv", ctypes.default_abi, ctypes.int,
        ctypes.int, ctypes.void_t.ptr, ctypes.int, ctypes.int);
    let send = stdlib.declare("send", ctypes.default_abi, ctypes.int,
        ctypes.int, ctypes.void_t.ptr, ctypes.int, ctypes.int);
    // *************************************************************
    // Sleep
    function Sleep(time) {
        let t = this._time = new Date();
        t.setTime(t.getTime() + time);
    }
    Sleep.prototype = {
        getTime: function() {
            return this._time.getTime();
        },
        toString: function() {
            return "[object Sleep(" + this._time + ")]";
        },
        ready: function(sched) {
            sched.schedule_timer(this);
        }
    }

    // *************************************************************
    // Socket
    function Socket() {
        // AF_INET 2
        // SOCK_STREAM 1
        // default protocol 0
        this._fd = socket(2, 1, 0);
    }
    Socket.prototype = {
        gethostbyname: function(name) {
            // WARNING DANGER!!!
            // This blocks.
            var host = gethostbyname(name);
            // Returns a list of four ints.
            var contents = host.contents.h_addr_list.contents.contents;
            return [contents[0], contents[1], contents[2], contents[3]];
        },
        connect: function(address, port) {
            if (typeof address === "string") {
                address = address.split('.');
            }
            let server_addr = new sockaddr_in(
                {sin_family: 2, sin_port: htons(port), sin_addr: address,
                sin_zero: [0,0,0,0,0,0,0,0]});
            print(server_addr);
            let rval = connect(this._fd, server_addr.address(), sockaddr_in.size);
            if (rval) {
                let err = errno();
                throw new Error("Error connecting to " + address + " " + port + " (" + err + ")");
            }
        },
        send: function(data) {
            let arraytype = ctypes.char.array(data.length);
            return send(this._fd, arraytype(data).address(), data.length, 0);
        },
        recv: function(howmuch) {
            let carray = ctypes.char.array(howmuch)();
            let received = recv(this._fd, carray.address(), howmuch, 0);
            var recvstr = carray.readString();
            recvstr.substring(0, received);
            return recvstr;
        }
    }
/*
    let sock = new Socket();
    print(sock.gethostbyname("google.com"));
    let result = sock.gethostbyname("localhost");
    print(result);
    sock.connect(result, 6000);
    sock.send("hello\n");
    print(sock.recv(32));
*/
    // *************************************************************
    // Receive
    function Receive(actor, pattern, timeout) {
        this._actor = actor;
        this._pattern = pattern;
        this._timeout = timeout;
        this._start = 0;
    }
    Receive.prototype = {
        toString: function() {
            return "[object Receive(" + this._pattern + ")]";
        },
        ready: function(sched) {
            let mb = this._actor._mailbox;
            let pattern = this._pattern;
            let l = mb.length;
            for (var i = this._start; i < l; i++) {
                if (mb[i][0] === pattern) {
                    break;
                }
            }
            if (i === l) {
                this._actor._recv = evt;
                this._start = i;
            } else {
                // We found a match for our pattern
                let result = null;
                try {
                    result = this._gen.send(mb[i][1]);
                    mb.splice(i, 1);
                } catch (e) {
                    if (e instanceof StopIteration) {
                        return;
                    }
                    throw e;
                }
                result._gen = this._gen;
                delete this._gen;
                sched.schedule(result);
            }
        }
    }

    // *************************************************************
    // Actor
    function Actor(main) {
        let actor = this;
        this._main = '(' + main.toString() + '())';
        let mailbox = this._mailbox = [];
        this._sandbox = evalcx("lazy");
        this._sandbox.receive = function(pattern, timeout) {
            return new Receive(actor, pattern, timeout);
        };
        this._sandbox.wait = function(time) { return new Sleep(time) };
        this._sandbox.print = function(what) { print(what) };
    }
    Actor.prototype = {
            toString: function() {
            return "[object Actor]";
        },
        ready: function(sched) {
            if (this._running) return;
            try {
                let state = this._sandbox.eval(this._main);
                let next = null;
                this._running = true;
                if (state && state.next) {
                    try {
                        next = state.next();
                    } catch (e) {
                        if (e instanceof StopIteration) return;
                        throw e;
                    }
                    next._gen = state;
                    sched.schedule(next);
                }
            } catch (e) {
                print("Error in Actor:");
                print(this._main.toString());
                print(e);
                print(e.stack);
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
        cast: function(pattern, message) {
            if (!message instanceof Address) {
                JSON.stringify(message)
            }
            this._actor._mailbox.push([pattern.toString(), message]);
            this._scheduler.schedule(this._actor);
        }
    }

    // *************************************************************
    // Pavel
    function Pavel() {
        this._readies = [];
        this._timers = [];
        this._waiters = [];
        for (let i = 0; i < MAX_FDS; i++) {
            this._waiters[i] = {fd: 0, events: 0, revents: 0};
        }
        this._waiting_fds = 0;
        let pollfd = ctypes.StructType("pollfd",
            [{fd: ctypes.int},
            {events: ctypes.short},
            {revents: ctypes.short}]);
        this._fd_array_t = pollfd.array(MAX_FDS);
        this._fds = this._fd_array_t(this._waiters);
        this._poll = stdlib.declare("poll", ctypes.default_abi, ctypes.int,
            pollfd.ptr, ctypes.int, ctypes.int);
    }
    Pavel.prototype = {
        schedule: function(actor) {
            if (actor._running) {
                return;
            }
            if (actor._recv) {
                actor = actor._recv;
                delete actor._recv;
            }
            this._readies.push(actor);
        },
        schedule_timer: function(timer) {
            sched._timers.push(timer);
            sched._timers.sort(function(a, b) {
                return ((a._time < b._time) ? -1 : ((a._time > b._time) ? 1 : 0));
            });
        },
        schedule_io: function(read, write, timeout) {
        
        },
        sleep: function(timeout) {
            this._poll(this._fds, this._waiting_fds, timeout);
        },
        spawn: function(main) {
            let actor = new Actor(main);
            this._readies.push(actor);
            return new Address(actor, this);
        },
        drain: function(timeout) {
            while (this._readies.length || this._timers.length) {
                while (this._readies.length) {
                    let evt = this._readies.shift();
                    if (evt.ready) {
                        evt.ready(this);
                    } else {
                        throw new Error("Invalid event: " + evt.toString());
                    }
                }
                let now = new Date();
                for (var i = 0, l = this._timers.length; i < l; i++) {
                    if (now < this._timers[i]._time) {
                        break;
                    }
                }
                let timers = this._timers.splice(0, i);
                while (timers.length) {
                    let timer = timers.shift();
                    this.schedule(timer._gen);
                    delete timer._gen;
                }
                if (!this._readies.length && this._timers.length) {
                    let sleepTime = (this._timers[0].getTime() - new Date().getTime());
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

