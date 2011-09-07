

let [cast, wait, receive, connect] = (function ActorMain() {
    let _mailbox = [];
    let _pattern = null;
    let top_gen = null;
    let next = null;
    let gen_stack = [];

    function Socket(host, port) {
        this._fd = null;
        this._message = ["connect", host, port];
    }
    Socket.prototype = {
        toString: function() { return "[object Socket(" + this._fd + ")]"; },
        recv: function recv(howmuch) {
            this._message = ["recv", howmuch];
            let result = yield this;
            yield result[1];
        },
        send: function send(data) {
            this._message = ["send", data];
            let result = yield this;
        },
        close: function close() {
            this._message = ["close"];
            yield this;
        }
    }

    function connect(host, port) {
        let sock = new Socket(host, port);
        sock._fd = yield sock;
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
                    try {
                        next = gen_stack[gen_stack.length - 1].send(mb[i][1]);
                        mb.splice(i, 1);
                    } catch (e) {
                        if (e instanceof StopIteration) {
                            gen_stack.pop();
                            next = gen_stack[gen_stack.length - 1].send(next);
                            _actor_main();
                        } else {
                            throw e;
                        }
                    }
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
            } else if (next && next.next) {
                gen_stack.push(next);
                next = next.next();
                return _actor_main();
            } else if (next === undefined) {
                print("undef");
                return;
            } else {
                // anything else must be a return value from a generator
                gen_stack.pop();
                next = gen_stack[gen_stack.length - 1].send(next);
                return;
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

