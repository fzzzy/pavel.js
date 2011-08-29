

let pavel = (function pavel() {
    let ev = ctypes.open(ctypes.libraryName("ev"));
    let sleep = ev.declare("ev_sleep", ctypes.default_abi, ctypes.void_t, ctypes.double);
    function Sleep(time) {
        let t = this._time = new Date();
        t.setTime(t.getTime() + time);
    }
    Sleep.prototype.getTime = function() {
        return this._time.getTime();
    }    

    function Receive(actor, pattern, timeout) {
        this.actor = actor;
        this.pattern = pattern;
        this.timeout = timeout;
    }

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

    function Address(actor) {
        this._actor = actor;
    }
    Address.prototype.cast = function(message) {
        this._actor._mailbox.push(JSON.stringify(message));
    }

    function Pavel() {
        this._events = [];
        this._timers = [];
    }
    Pavel.prototype.spawn = function(main) {
        let actor = new Actor(main);
        this._events.push(actor);
        return new Address(actor);
    }
    Pavel.prototype.drain = function(timeout) {
        while (this._events.length || this._timers.length) {
            while (this._events.length) {
                let evt = this._events.shift();
                if (evt instanceof Actor) {
                    let sandbox = evalcx("", evt._sandbox);
                    try {
                        let result = sandbox.eval(evt._main);
                        if (result && result.next) {
                            this._events.push(result);
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
                this._events.push(timer._evt);
                delete timer._evt;
            }
            if (!this._events.length && this._timers.length) {
                let sleepTime = (this._timers[0].getTime() - new Date().getTime());
                sleep(sleepTime / 1000.0);
            }
        }
    }
    
    return new Pavel();
}());


let act1 = pavel.spawn(function main() {
    for (let i = 0; i < 10; i++) {
        print("Hello");
        yield wait(50);    
    }
});

let act2 = pavel.spawn(function main() {
    for (let i = 0; i < 10; i++) {
        print("Goodbye");
        yield wait(100);
    }
});

pavel.drain();

