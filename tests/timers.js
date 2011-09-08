
let iters = yield receive("iters");
let msg = yield receive("msg");
let delay = yield receive("delay");

for (let i = 0; i < iters; i++) {
    print(msg);
    yield wait(delay);
}
