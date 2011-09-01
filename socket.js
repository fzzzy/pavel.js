
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
let c_gethostbyname = stdlib.declare("gethostbyname", ctypes.default_abi, hostent.ptr,
    ctypes.char.ptr);
let c_connect = stdlib.declare("connect", ctypes.default_abi, ctypes.int,
    ctypes.int, sockaddr_in.ptr, ctypes.int);
let c_recv = stdlib.declare("recv", ctypes.default_abi, ctypes.int,
    ctypes.int, ctypes.void_t.ptr, ctypes.int, ctypes.int);
let c_send = stdlib.declare("send", ctypes.default_abi, ctypes.int,
    ctypes.int, ctypes.void_t.ptr, ctypes.int, ctypes.int);

// *************************************************************
// Socket
function Socket() {
    // AF_INET 2
    // SOCK_STREAM 1
    // default protocol 0
    this._fd = socket(2, 1, 0);
}
Socket.prototype = {
    toString: function() {
        return "[object Socket(" + this._fd + ")]";
    },
    gethostbyname: function(name) {
        // WARNING DANGER!!!
        // This blocks.
        var host = c_gethostbyname(name);
        // Returns a list of four ints.
        var contents = host.contents.h_addr_list.contents.contents;
        return [contents[0], contents[1], contents[2], contents[3]];
    },
    ready: function(sched) {
        if (this._gen) {
            sched.schedule(this._gen);
        } else {
            sched.schedule_io(this);
        }
    },
    connect: function(address, port) {
        if (typeof address === "string") {
            address = address.split('.');
        }
        let server_addr = new sockaddr_in(
            {sin_family: 2, sin_port: htons(port), sin_addr: address,
            sin_zero: [0,0,0,0,0,0,0,0]});
        let rval = c_connect(this._fd, server_addr.address(), sockaddr_in.size);
        if (rval) {
            let err = errno();
            throw new Error("Error connecting to " + address + " " + port + " (" + err + ")");
        }
    },
    send: function(data) {
        print("socksend", Object.keys(this));
        print("socksend", data, data.length);
        let arraytype = ctypes.char.array(data.length);
        this._send = true;
        yield this;
        let result = c_send(this._fd, arraytype(data).address(), data.length, 0);
        print("gengen", this._gen);
        yield this.send(result);
    },
    recv: function(howmuch) {
        let carray = ctypes.char.array(howmuch)();
        this._recv = true;
        yield this;
        let received = c_recv(this._fd, carray.address(), howmuch, 0);
        var recvstr = carray.readString();
        recvstr.substring(0, received);
        print("RECRVRECCV");
        yield recvstr;
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

connect = function(host, port) {
    let sock = new Socket();
    sock.connect(sock.gethostbyname(host), port);
    return sock;
}
