
let act1 = spawn('tests.timers');
let act2 = spawn('tests.timers');

act1.cast("iters", 7); act1.cast("msg", 'hello!'); act1.cast("delay", 222);
act2.cast("iters", 13); act2.cast("msg", 'goodbye!'); act2.cast("delay", 333);

let act3 = spawn('tests.basic');
let act4 = spawn('tests.basic2');

act3.cast("peer", act4);
act4.cast("peer", act3);

let act5 = spawn('tests.socket');
