
let peer = yield receive("peer");
peer.cast("message", "bar");
let message = yield receive("message");
print("Act2 saw: " + message);
peer.cast("message", "frotz");
message = yield receive("message");
print("Act2 saw: " + message);
peer.cast("message", "xyzzy");
message = yield receive("message");
print("Act2 saw: " + message);
