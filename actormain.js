

let [_cast, _resume, _drain, wait, receive, connect, setTimeout, clearTimeout, XMLHttpRequest] = (function ActorMain() {
    let _mailbox = [];
    let _gen_stack = [];
    let _pattern = null;
    let _next = null;
    let _draining = false;

    let _timeouts = {};
    let _connects = [];
    let _xhrs = {};
    let _xhrid = 0;

    function cast(pattern, message) {
        _mailbox.push([pattern, message]);
        _schedule_event("runnable");
    }

    function Any() {}

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
        _schedule_event("connect", [host, port, sock._id]);
        let result = yield new SuspendUntil("connect");
        sock._fd = result[0];
        yield result(sock);
    }

    function SuspendUntil(pattern) {
        this._pattern = pattern;
    }
    SuspendUntil.prototype = {
        toString: function tostring() {
            return "[object SuspendUntil('" + this._pattern + "')]";
        }
    }

    function wait(time) {
        let t = this._time = new Date();
        t.setTime(t.getTime() + time);
        _schedule_event("wait", [t, null]);
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
                if (_pattern !== Any) {
                    for ( ; i < _mailbox.length; i++) {
                        if (_mailbox[i][0] === _pattern) break;
                    }
                }
                if (i === _mailbox.length) {
                    return;
                } else {
                    // We found a match for our pattern
                    if (_pattern === Any) {
                        _next = result(_mailbox[i]);
                    } else {
                        _next = result(_mailbox[i][1]);
                    }
                    _pattern = null;
                    _mailbox.splice(i, 1);
                }
            } else if (_next instanceof SuspendUntil) {
                _pattern = _next._pattern;
                if (_pattern === undefined) {
                    _pattern = Any;
                }
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
            } else if (_next === _sentinel) {
                // Main script body has finished, now we run drain until all scheduled events have concluded
                _gen_stack.push(drain());
                _next = _gen_stack[_gen_stack.length - 1].next();
            } else {
                print("Warning: Unknown event:", _next);
                return;
            }
        }
    }

    function setTimeout(func, timeout) {
        let key = Object.keys(_timeouts).length;
        let t = this._time = new Date();
        t.setTime(t.getTime() + timeout);
        _timeouts[key] = [func, arguments];
        _schedule_event("wait", [t, key]);
    }

    function clearTimeout(key) {
        let timeout = _timeouts[key];
        if (timeout) {
            timeout[0] = function() {};
        }
    }

    function urlparse(url) {
        let result = {};
        let netloc = '';
        let query = '';
        let fragment = '';
        let i = url.indexOf(':')
        if (i > 0) {
           result.scheme = url.substring(0, i);
            url = url.substring(i + 1);
            i = url.indexOf('/', 2);
            if (i > 0) {
                result.netloc = url.substring(2, i);
                url = url.substring(i);
            }
            i = url.indexOf('#');
            if (i > 0) {
                result.fragment = url.substring(i + 1)
                url = url.substring(0, i);
            }
            i = url.indexOf('?');
            if (i > 0) {
                result.query = url.substring(i + 1);
                url = url.substring(0, i);
            }
        }
        result.url = url;
        return result;
    }

    function XMLHttpRequest() {
        this.readyState = 0;
        this.status = 0;
        this.statusText = "";
        this._response = "";
        this.responseText = "";
        this.responseXML = null;
        this._id = XMLHttpRequest.prototype._id++;
        this._headers = [];
        this._responseHeaders = [];
    }
    XMLHttpRequest.prototype = {
        UNSENT: 0,
        OPENED: 1,
        HEADERS_RECEIVED: 2,
        LOADING: 3,
        DONE: 4,
        _id: 0,
        onreadystatechange: function() {},
        open: function open(method, url, async, user, pw) {
            let parts = urlparse(url);
            let host = parts.netloc;
            let port = 0;
            if (parts.scheme === 'http') {
                port = 80;
            } else if (parts.scheme === 'https') {
                port = 443;
            } else {
                throw new Error("Unsupported scheme: " + parts.scheme);
            }

            let i = host.indexOf(':');
            if (i > 0) {
                port = parseInt(host.substring(i + 1));
                host = host.substring(0, i);
            }
            this._sock = new Socket(host, port);
            _xhrs[this._id] = this;
            _schedule_event("connect", [host, port, this._id]);
            this._host = host;
            this._method = method;
            this._url = parts.url;
            this._user = user;
            this._pw = pw;
        },
        setRequestHeader: function setRequestHeader(header, value) {
            this._headers.push([header, value]);
        },
        send: function send(data) {
            this._request = this._method + ' ' + this._url + ' HTTP/1.0\r\n';
            this._request += 'Host: ' + this._host + '\r\n';
            if (data) {
                this._request += 'Content-Length: ' + data.length + '\r\n';
            }
            for (let i = 0; i < this._headers.length; i++) {
                let key = this._headers[i][0];
                let val = this._headers[i][1];
                this._request += key + ': ' + val + '\r\n';
            }
            this._request += '\r\n';
            if (data) {
                this._request += data;
            }
            if (this.readyState === XMLHttpRequest.prototype.OPENED) {
                _schedule_event("send", [this._fd, this._request, this._id]);
            }
        },
        abort: function abort() {
        
        },
        getResponseHeader: function getResponseHeader(header) {
        
        },
        getAllResponseHeaders: function getAllResponseHeaders() {
            return this._responseHeaders;
        }
    }

    function drain() {
        while (Object.keys(_timeouts).length || Object.keys(_xhrs).length) {
            let next = yield receive();
            let pattern = next[0];
            let data = next[1];
            if (pattern === "wait") {
                let func = _timeouts[data][0];
                let args = _timeouts[data][1];
                try {
                    func.apply(null, args);
                } catch (e) {
                    print("Exception in timer:");
                    print(e);
                    print(e.stack);
                }
            } else if (pattern === "connect") {
                let fd = data[0];
                let xhr = _xhrs[data[1]];
                xhr._fd = fd;
                xhr.readyState = XMLHttpRequest.prototype.OPENED;
                xhr.onreadystatechange.apply(xhr);
                if (xhr._request) {
                    _schedule_event("send", [fd, xhr._request, xhr._id]);
                }
            } else if (pattern === "send") {
                let xhr = _xhrs[data[2]];
                xhr._request = xhr._request.substring(data[1]);
                if (xhr._request.length) {
                    _schedule_event("send", [xhr._fd, xhr._request, xhr._id]);
                } else {
                    _schedule_event("recv", [xhr._fd, 32768, xhr._id]);
                }
            } else if (pattern === "recv") {
                let xhr = _xhrs[data[2]];
                xhr._response += data[1];
//                xhr.responseText += data[1];
                if (!xhr.statusText) {
                    let i = xhr._response.indexOf("\r\n\r\n");
                    xhr._bodyIndex = i + 4;
                    if (i > 0) {
                        let j = xhr._response.indexOf("\r\n");
                        let parts = xhr._response.substring(0, j).split(' ');
                        xhr.status = parseInt(parts[1]);
                        for (let q = 1; q < parts.length; q++) {
                            xhr.statusText += parts[q] + " ";
                        }
                        xhr.statusText = xhr.statusText.substring(0, xhr.statusText.length - 1);
                        let headers = xhr._response.substring(j + 2, i);
                        while (headers) {
                            let k = headers.indexOf("\r\n");
                            let header = "";
                            if (k > 0) {
                                header = headers.substring(0, k);
                                headers = headers.substring(k + 2);
                            } else {
                                header = headers;
                                headers = "";
                            }
                            let l = header.indexOf(": ");
                            let key = header.substring(0, l);
                            let val = header.substring(l + 2);
                            if (key.toLowerCase() === "content-length") {
                                xhr._contentLength = parseInt(val);
                            }
                            xhr._responseHeaders.push([key, val]);
                        }
                        xhr.readyState = XMLHttpRequest.prototype.HEADERS_RECEIVED;
                        xhr.onreadystatechange.apply(xhr);
                    }
                }
                if (xhr._bodyIndex + xhr._contentLength === xhr._response.length) {
                    xhr.responseText = xhr._response.substring(xhr._bodyIndex);
                    xhr.readyState = XMLHttpRequest.prototype.DONE;
                    xhr.onreadystatechange.apply(xhr);
                    delete _xhrs[xhr._id];
                } else {
                    xhr.readyState = XMLHttpRequest.prototype.LOADING;
                    xhr.onreadystatechange.apply(xhr);
                }

            }
        }
    }

    function resume() {
        try {
            return _actor_main();
        } catch (e) {
            if (e instanceof StopIteration) {
                return;
            }
            print('Error in Actor:');
            //print(_script);
            print(e);
            print(e.stack);
        }
    }
    return [cast, resume, drain, wait, receive, connect, setTimeout, clearTimeout, XMLHttpRequest];
}());

