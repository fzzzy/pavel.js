

let [_cast, _resume, wait, receive, connect] = (function ActorMain() {
    let _mailbox = [];
    let _gen_stack = [];
    let _pattern = null;
    let _next = null;

    function Result(val) {
        this._val = val;
    }
    function result(val) {
        return new Result(val);
    }

    function Socket(host, port) {
        this._fd = null;
    }
    Socket.prototype = {
        toString: function() { return "[object Socket(" + this._fd + ")]"; },
        recv: function recv(howmuch) {
            _schedule_event("recv", [this._fd, howmuch]);
            let r = yield new SuspendUntil("recv");
            yield result(r[1]);
        },
        send: function send(data) {
            _schedule_event("send", [this._fd, data]);
            let r = yield new SuspendUntil("send");
            yield result(r[1]);
        },
        close: function close() {
            _schedule_event("close", [this._fd]);
            yield new SuspendUntil("close");
        }
    }

    function connect(host, port) {
        let sock = new Socket(host, port);
        _schedule_event("connect", [host, port]);
        sock._fd = yield new SuspendUntil("connect");
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
        _schedule_event("wait", t);
        return new SuspendUntil("wait");
    }

    function receive(pattern) {
        return new SuspendUntil(pattern);
    }

    function _actor_main() {
        if (!_gen_stack.length) {
            _gen_stack = [eval(_script)];
            _next = _gen_stack[0].next();
        }

        while (_next) {
            if (_pattern) {
                let i = 0;
                for ( ; i < _mailbox.length; i++) {
                    if (_mailbox[i][0] === _pattern) break;
                }
                if (i === _mailbox.length) {
                    return;
                } else {
                    // We found a match for our pattern
                    _pattern = null;
                    _next = result(_mailbox[i][1]);
                    _mailbox.splice(i, 1);
                }
            } else if (_next instanceof SuspendUntil) {
                _pattern = _next._pattern;
                return;
            } else if (_next instanceof Result) {
                // a value to pump into a generator
                try {
                    _next = _gen_stack[_gen_stack.length - 1].send(_next._val);
                } catch (e) {
                    if (e instanceof StopIteration) {
                        _gen_stack.pop();
                        if (!_gen_stack.length) return;
                    } else {
                        throw e;
                    }
                }
            } else if (_next && _next.next) {
                _gen_stack.push(_next);
                _next = _next.next();
            }
        }
    }
    function cast(pattern, message) {
        _mailbox.push([pattern, message]);
        _schedule_event("runnable");
    }
    function resume() {
        try {
            return _actor_main();
        } catch (e) {
            if (e instanceof StopIteration) return;
            print('Error in Actor:');
            print(e);
            print(e.stack);
        }
    }
    return [cast, resume, wait, receive, connect];
}());

