
const MAX_FDS = 32;

let pavel = (function pavel() {
    // *************************************************************
    // ctypes
    let libpoll = ctypes.open(ctypes.libraryName("poll"));
    let stdlib = ctypes.open(ctypes.libraryName("stdc++"));
    let pollfd = ctypes.StructType("pollfd",
        [{fd: ctypes.int},
        {events: ctypes.short},
        {revents: ctypes.short}]);
    var fd_array_t = pollfd.array(MAX_FDS);
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

    // *************************************************************
    // Sleep
    function Sleep(time) {
        let t = this._time = new Date();
        t.setTime(t.getTime() + time);
    }
    Sleep.prototype.getTime = function() {
        return this._time.getTime();
    }    

    // *************************************************************
    // Receive
    function Receive(actor, pattern, timeout) {
        this.actor = actor;
        this.pattern = pattern;
        this.timeout = timeout;
    }

    // *************************************************************
    // Actor
    function Actor(main) {
        this._main = '(' + main.toString() + '())';
        let mailbox = this._mailbox = [];
        this._sandbox = evalcx("lazy");
        this._sandbox.receive = function(pattern, timeout) {
            return new Receive(mailbox, pattern, timeout);
        };
        this._sandbox.wait = function(time) { return new Sleep(time) };
        this._sandbox.print = function(what) { print(what) };
    }

    // *************************************************************
    // Address
    function Address(actor) {
        this._actor = actor;
    }
    Address.prototype.cast = function(message) {
        this._actor._mailbox.push(JSON.stringify(message));
    }

    // *************************************************************
    // Pavel
    function Pavel() {
        this._readies = [];
        this._waiters = [];
        for (let i = 0; i < MAX_FDS; i++) {
            this._waiters[i] = {fd: 0, events: 0, revents: 0};
        }
        this._waiting_fds = 0;
        this._fds = fd_array_t(this._waiters);
        this._timers = [];
        this._poll = stdlib.declare("poll", ctypes.default_abi, ctypes.int,
            pollfd.ptr, nfds_t, ctypes.int);
    }
    Pavel.prototype.sleep = function(timeout) {
        this._poll(this._fds, this._waiting_fds, timeout);
    }
    Pavel.prototype.spawn = function(main) {
        let actor = new Actor(main);
        this._readies.push(actor);
        return new Address(actor);
    }
    Pavel.prototype.drain = function(timeout) {
        while (this._readies.length || this._timers.length) {
            while (this._readies.length) {
                let evt = this._readies.shift();
                if (evt instanceof Actor) {
                    let sandbox = evalcx("", evt._sandbox);
                    try {
                        let result = sandbox.eval(evt._main);
                        if (result && result.next) {
                            this._readies.push(result);
                        }
                    } catch (e) {
                        print("Error in Actor:");
                        print(evt._main.toString());
                        print(e);
                        print(e.stack);
                    }
                } else if (evt.next) {
                    let state;
                    try {
                        state = evt.next();
                    } catch (e) {
                        if (e instanceof StopIteration) continue;
                        throw e;
                    }
                    if (state instanceof Sleep) {
                        state._evt = evt;
                        this._timers.push(state)
                        this._timers.sort(function(a, b) {
                            return ((a._time < b._time) ? -1 : ((a._time > b._time) ? 1 : 0));
                        });
                    }
                } else if (evt instanceof Receive) {
                    // How do we get the actor here
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
                this._readies.push(timer._evt);
                delete timer._evt;
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
    for (let i = 0; i < 10; i++) {
        print("Hello");
        yield wait(111);    
    }
});

let act2 = pavel.spawn(function main() {
    for (let i = 0; i < 10; i++) {
        print("Goodbye");
        yield wait(333);
    }
});

pavel.drain();

