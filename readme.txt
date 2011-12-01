Pavel JavaScript Actor Environment
==================================

Warning: This is an experimental prototype. While I encourage you to try it out, it will probably break, set fire to your hair, seduce your woman and drink all your beer.

This is an Actor environment for JavaScript using SpiderMonkey with ctypes.

To use it, first compile SpiderMonkey with ctypes. Follow the normal instructions for building, but use 'configure --enable-ctypes --with-system-nspr'. If this compiles, run the js interpreter and type 'ctypes'. If ctypes was built correctly, you will see "not a CType". I think that's a zen koan or something.

Then, use the ctypes SpiderMonkey binary to run the pavel script, and pass any number of command line arguments which are .js files to start and run. Each js file will be it's own Actor and will not be able to access the state of any of the other Actors. They will be cooperatively scheduled in one thread; a runtime implemented in C which uses multiple POSIX threads and automatically schedules ready-to-run Actors on idle threads is also being worked on.

The Actor environment is set up with dom.js providing an implementations of many dom APIs usually provided by browsers. Also, Pavel itself implements setTimeout/clearTimeout/setInterval/clearInterval as well as XMLHttpRequest using ctypes and poll.

Less conventionally, it also provides cooperation APIs which must be used in conjunction with SpiderMonkey's generators. The .js files which are passed to the pavel script are automatically wrapped in a generator so that yield expressions may be used at the top level.

yield wait(1)

  Suspends the current Actor for 1 second and runs any other ready-to-run Actors.

var child = spawn('foo/bar.js');

  Spawns a new actor and returns an Address object. The child is scheduled for execution and the main script continues running.

child.cast('pattern', {message: 'hello'})

  Send a message to a child Actor that was spawned previously. The message is inserted into the child's mailbox, the child is scheduled, and control returns to the sender immediately.
  
  The first argument is the pattern string which is used for selective receive on the other end. The second argument is any JSON serializable object.

let message = yield receive('pattern');

  Suspend this Actor until another actor sends us a message with the 'pattern' pattern.

let sock = connect("localhost", 4242);

  Connect a raw tcp socket. This will become asynchronous in the future and will require 'yield connect'

yield sock.send("hello");

  Suspend this Actor until the given bytes have been written to the socket, and then resume it.

let got = yield sock.recv(5);

  Suspend this actor until the socket is ready for reading, and then read and return at most 5 bytes from the socket. The Actor is resumed once the read is complete.

yield sock.close();

  Suspend this actor until the socket is closed, then resume it.

There are not yet any APIs for opening server sockets, although they will be trivial to add.

Smarter pattern matching than just requiring the message sender to specify a string would be nice. Currently I am thinking it will be possible to create unique pattern strings by introspecting the message object.

The ability to select more than one type of message from the mailbox will be essential. Usage would look something like this:

  let [pattern, message] = yield receive('pattern1', 'pattern2');

This makes which pattern matched explicit so the user can decide what to do based on the message kind without having to guess from the message itself.

There is not a lot of code in this project. If you are a js hacker and this sounds interesting, please consider helping out.

Join the #domjs channel on the Mozilla IRC servers if you are interested in either pavel.js or dom.js.

Donovan Preston
August 2011
