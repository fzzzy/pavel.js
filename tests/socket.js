
print(":::: start");
let sock = yield connect("localhost", 6000);
print(":::: we connected", sock, Object.keys(sock));
yield sock.send("hello");
print(":::: we sent");
let got = yield sock.recv(32);
print(":::: we got", got);
yield sock.close();
print(":::: we closed");
