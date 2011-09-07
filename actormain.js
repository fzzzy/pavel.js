

let [cast, wait, receive, connect] = (function ActorMain() {
    let _mailbox = [];
    let _pattern = null;
    let top_gen = null;
    let next = null;
    let gen_stack = [];

    function Result(val) {
        this._val = val;
    }
    function result(val) {
        return new Result(val);
    }

    function Socket(host, port) {
        this._fd = null;
        this._message = ["connect", host, port];
    }
    Socket.prototype = {
        toString: function() { return "[object Socket(" + this._fd + ")]"; },
        recv: function recv(howmuch) {
            this._message = ["recv", howmuch];
            let r = yield this;
            yield result(r[1]);
        },
        send: function send(data) {
            this._message = ["send", data];
            let r = yield this;
            yield result(r[1]);
        },
        close: function close() {
            this._message = ["close"];
            yield this;
        }
    }

    function connect(host, port) {
        let sock = new Socket(host, port);
        sock._fd = yield sock;
        yield result(sock);
    }

    function SuspendUntil(pattern, message) {
        this._pattern = pattern;
        this._message = message;
    }
    SuspendUntil.prototype = {
        toString: function tostring() {
            return "[object SuspendUntil('" + this._pattern + "', '" + this._message + "')]";
        }
    }
    function wait(time) {
        let t = this._time = new Date();
        t.setTime(t.getTime() + time);
        return new SuspendUntil("wait", t);
    }
    function receive(pattern) {
        return new SuspendUntil("msg", pattern);
    }

    function _actor_main() {
        if (top_gen === null) {
            top_gen = eval(_script);
            next = top_gen.next();
            gen_stack = [top_gen];
        }

        while (next) {
            if (_pattern) {
                let mb = _mailbox;
                let l = mb.length;
                let i = 0;
                for ( ; i < l; i++) {
                    if (mb[i][0] === _pattern) {
                        break;
                    }
                }
                if (i === l) { return; } else {
                    _pattern = null;
                    // We found a match for our pattern
                    next = result(mb[i][1]);
                    mb.splice(i, 1);
                }
            } else if (next instanceof SuspendUntil) {
                if (next._pattern === "msg") {
                    _pattern = next._message;
                }
                _schedule_event(next._pattern, next._message);
            } else if (next instanceof Socket) {
                _pattern = next._message[0];
                if (_pattern === "connect") {
                    _schedule_event(_pattern, [next._message[1], next._message[2]]);
                } else {
                    _schedule_event(_pattern, [next._fd, next._message[1]]);
                }
            } else if (next instanceof Result) {
                // a value to pump into a generator
                try {
                    next = gen_stack[gen_stack.length - 1].send(next._val);
                } catch (e) {
                    if (e instanceof StopIteration) {
                        gen_stack.pop();
                        if (!gen_stack.length) return;
                    } else if (e instanceof TypeError) {
                        // If we got a "generator already running" error
                        // then code is synchronously ping-ponging between
                        // actors on the same stack, and we have to drop back
                        // to the main loop and wait until this generator is not
                        // running before we can crank it again.
                        return;
                    } else {
                        throw e;
                    }
                }
            } else if (next && next.next) {
                gen_stack.push(next);
                next = next.next();
                return _actor_main();
            } else if (next === undefined) {
                print("undef");
                return;
            } else {
                print("unknown");
            }
        }
    }
    function cast(pattern, message) {
        _mailbox.push([pattern, message]);
        try {
            return _actor_main();
        } catch (e) {
            if (e instanceof StopIteration) { return; }
            print('Error in Actor:');
            print(e);
            print(e.stack);
        }
    }
    return [cast, wait, receive, connect];
}());

