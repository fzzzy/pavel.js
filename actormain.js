
let _mailbox = [];
let _pattern = null;

let _resume = (function actor_main() {
    function SuspendUntil(pattern, message) {
        this._pattern = pattern;
        this._message = message;
    }
    SuspendUntil.prototype = {
        toString: function() {
            return "[object SuspendUntil('" + this._pattern + "', '" + this._message + "')]"
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
    let top_gen = eval(_script);
    let next = top_gen.next();
    gen_stack = [top_gen];
    while (true) {
        if (_pattern) {
            let mb = _mailbox;
            let l = mb.length;
            let i = 0;
            for ( ; i < l; i++) {
                if (mb[i][0] === _pattern) {
                    break;
                }
            }
            if (i === l) { yield; } else {
                // We found a match for our pattern
                try {
                    _pattern = null;
                    next = gen_stack[gen_stack.length - 1].send(mb[i][1]);
                    mb.splice(i, 1);
                } catch (e) {
                    if (e instanceof StopIteration) {
                        gen_stack.pop();
                    }
                    throw e;
                }
            }
        } else if (next instanceof SuspendUntil) {
            if (next._pattern === "msg") {
                _pattern = next._message;
            }
            yield [next._pattern, next._message];
        } else if (next && next.next) {
            gen_stack.push(next);
        } else {
            print("Unknown message", next);
        }
    }
}());

function resume() {
    try {
        return _resume.next();
    } catch (e) {
        if (!(e instanceof StopIteration)) {
            print('Error in Actor:');
            print(e);
            print(e.stack);
        }
    }
}
