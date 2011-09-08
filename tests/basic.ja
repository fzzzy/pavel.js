
let peer = yield receive("peer");
peer.cast("message", "foo");
let message = yield receive("message");
print("Act1 saw: " + message);
peer.cast("message", "baz");
message = yield receive("message");
print("Act1 saw: " + message);
peer.cast("message", "foom");
message = yield receive("message");
print("Act1 saw: " + message);

