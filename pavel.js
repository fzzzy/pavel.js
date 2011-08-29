
const MAX_FDS = 32;

let pavel = (function pavel() {
    // *************************************************************
    // ctypes
    let stdlib = ctypes.open(ctypes.libraryName("stdc++"));
    let evwrap = ctypes.open(ctypes.libraryName("evwrap"));
    let errno = evwrap.declare("err", ctypes.default_abi, ctypes.int);
    let pollfd = ctypes.StructType("pollfd",
        [{fd: ctypes.int},
        {events: ctypes.short},
        {revents: ctypes.short}]);
    let fd_array_t = pollfd.array(MAX_FDS);
    let malloc = stdlib.declare("malloc", ctypes.default_abi, ctypes.void_t.ptr, ctypes.int);
    let free = stdlib.declare("free", ctypes.default_abi, ctypes.void_t, ctypes.void_t.ptr);
    let nfds_t = ctypes.int;
    let [POLLIN, POLLPRI, POLLOUT,
    POLLRDNORM, POLLWRNORM,
    POLLRDBAND, POLLWRBAND,
    POLLERR, POLLHUP, POLLNVAL] = [
        1, 2, 4,
        0x40, 4,
        0x80, 0x100,
        8, 0x10, 0x20];

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
    let sockaddr_p = ctypes.PointerType(sockaddr_in);
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
    Sleep.prototype.getTime = function() {
        return this._time.getTime();
    }
    Sleep.prototype.toString = function() {
        return "[object Sleep(" + this._time + ")]";
    }

    // *************************************************************
    // Socket
    function Socket() {
        // AF_INET 2
        // SOCK_STREAM 1
        // default protocol 0
        this._fd = socket(2, 1, 0);
    }
    Socket.prototype.gethostbyname = function(name) {
        // WARNING DANGER!!!
        // This blocks.
        var host = gethostbyname(name);
        // Returns a list of four ints.
        var contents = host.contents.h_addr_list.contents.contents;
        return [contents[0], contents[1], contents[2], contents[3]];
    }
    Socket.prototype.connect = function(address, port) {
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
    }
    Socket.prototype.send = function(data) {
        let arraytype = ctypes.char.array(data.length);
        return send(this._fd, arraytype(data).address(), data.length, 0);
    }
    Socket.prototype.recv = function(howmuch) {
        let carray = ctypes.char.array(howmuch)();
        let received = recv(this._fd, carray.address(), howmuch, 0);
        var recvstr = carray.readString();
        recvstr.substring(0, received);
        return recvstr;
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
    }
    Receive.prototype.toString = function() {
        return "[object Receive]";
    }

    // *************************************************************
    // Actor
    function Actor(main) {
        let actor = this;
        this._main = '(' + main.toString() + '())';
        let mailbox = this._mailbox = [];
        this._sandbox = evalcx("lazy");
// temporary hack
//        this._sandbox = {};
        this._sandbox.receive = function(pattern, timeout) {
            return new Receive(actor, pattern, timeout);
        };
        this._sandbox.wait = function(time) { return new Sleep(time) };
        this._sandbox.print = function(what) { print(what) };
    }
    Actor.prototype.toString = function() {
        return "[object Actor]";
    }

    // *************************************************************
    // Address
    function Address(actor, scheduler) {
        this._actor = actor;
        this._scheduler = scheduler;
    }
    Address.prototype.cast = function(pattern, message) {
        if (!message instanceof Address) {
            JSON.stringify(message)
        }
        this._actor._mailbox.push([pattern.toString(), message]);
        this._scheduler.schedule(this._actor);
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
        this._fds = fd_array_t(this._waiters);
        this._poll = stdlib.declare("poll", ctypes.default_abi, ctypes.int,
            pollfd.ptr, nfds_t, ctypes.int);
    }
    Pavel.prototype.schedule = function(actor) {
        if (actor._running) {
            return;
        }
        if (actor._recv) {
            actor = actor._recv;
            delete actor._recv;
        }
        this._readies.push(actor);
    }
    Pavel.prototype.sleep = function(timeout) {
        this._poll(this._fds, this._waiting_fds, timeout);
    }
    Pavel.prototype.spawn = function(main) {
        let actor = new Actor(main);
        this._readies.push(actor);
        return new Address(actor, this);
    }
    Pavel.prototype.drain = function(timeout) {
        while (this._readies.length || this._timers.length) {
            while (this._readies.length) {
                let evt = this._readies.shift();
                if (evt instanceof Actor) {
                    if (evt._running) {
                        continue;
                    }
                    try {
                        let result = evt._sandbox.eval(evt._main);
// temporary hack                        
//                        let result = null;
//                        with (evt._sandbox) {
//                            result = eval(evt._main);
//                        }
                        evt._running = true;
                        if (result && result.next) {
                            this.schedule(result);
                        }
                    } catch (e) {
                        print("Error in Actor:");
                        print(evt._main.toString());
                        print(e);
                        print(e.stack);
                    }
                } else if (evt.next) {
                    evt.toString = function() { return "[object Generator]" }
                    let state;
                    try {
                        state = evt.next();
                    } catch (e) {
                        if (e instanceof StopIteration) {
                            continue;
                        }
                        throw e;
                    }
                    state._gen = evt;
                    this.schedule(state);
                } else if (evt instanceof Sleep) {
                    this._timers.push(evt)
                    this._timers.sort(function(a, b) {
                        return ((a._time < b._time) ? -1 : ((a._time > b._time) ? 1 : 0));
                    });
                } else if (evt instanceof Receive) {
                    let mb = evt._actor._mailbox;
                    let pattern = evt._pattern;
                    let l = mb.length;
                    for (var i = 0; i < l; i++) {
                        if (mb[i][0] === pattern) {
                            break;
                        }
                    }
                    if (i === l) {
                        evt._actor._recv = evt;
                    } else {
                        // We found a match for our pattern
                        let result = null;
                        try {
                            result = evt._gen.send(mb[i][1]);
                            mb.splice(i, 1);
                        } catch (e) {
                            if (e instanceof StopIteration) {
                                continue;
                            }
                            throw e;
                        }
                        result._gen = evt._gen;
                        delete evt._gen;
                        this.schedule(result);
                    }
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
act2.cast("peer", act1);
act1.cast("peer", act2);

pavel.drain();

